import fs from 'fs'
import { Context, Telegraf, Markup, Composer, Telegram, Input } from 'telegraf'
import { Update } from 'typegram'
import { useNewReplies } from 'telegraf/future'
import { message } from 'telegraf/filters'
import FlibustaAPI from 'flibusta'

import dotenv from 'dotenv'
import Book from 'flibusta/build/types/book'
import Author from 'flibusta/build/types/authors'
import { randomInt, randomUUID } from 'crypto'
import { BooksByName } from 'flibusta/build/types/booksByName'
import axios from 'axios'
import { fromBuffer } from 'telegraf/typings/input'
import { Readable } from 'stream'
import { request } from 'http'
import { dir } from 'console'

dotenv.config()

type BookInfo = {
  id: number
  title: string
  author: string
  description: string
  formats: Array<string>
}

interface BookFile {
  id: string
  file: Buffer
  fileName: string
  filePath?: string
}

type BookFormat = 'mobi' | 'fb2' | 'pdf' | 'epub'

const ORIGIN = 'http://flibusta.is/'
const bot: Telegraf<Context<Update>> = new Telegraf(process.env.BOT_TOKEN)
const flibustaApi = new FlibustaAPI(ORIGIN)
const PAGE_SIZE = 5
bot.use(useNewReplies())
// bot.use(Telegraf.log())

bot.start(ctx => {
  let startMessage = "Hi! I'm searching books and authors on Flibusta.is\n"
  startMessage += "To start searching send me title of the book or the author's name"
  return ctx.sendMessage(startMessage)
})

bot.help(ctx => {
  let helpMessage = "Just send me title of the book or the author's name so I can start searching\n"
  helpMessage += 'List of available commands:\n'
  helpMessage += '/start - show starting message\n'
  helpMessage += "/search 'title or name' - search for provided input\n"
  helpMessage += '/random - get random book\n'
  helpMessage += '/\n'
  helpMessage += '/\n'
  helpMessage += '/\n'
  return ctx.sendMessage(helpMessage)
})
bot.command('stop', ctx => {
  return ctx.sendMessage('stop')
})
bot.command('search', ctx => {
  const a = ctx.update.message.text
  const query = ctx.update.message.text
  dir(a)
  return ctx.sendMessage('search')
})

bot.command('random', ctx => {
  return ctx.sendMessage('search')
})

bot.hears(/(?<=^\/download)\d+$/, async ctx => {
  //get info on book
  const bookId: number = Number(ctx.match[0])
  const book = (await getBookInfoById(bookId)) as BookInfo
  const replyHTML = `${book.title}\n ${book.author}\n\n ${book.description}\n\n Choose format for download:`
  const buttons = book.formats.map(format => {
    const buttonCb = JSON.stringify({ id: book.id, format })
    return Markup.button.callback(format, buttonCb)
  })

  return ctx.sendMessage(replyHTML, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) })
})

bot.hears(/.+/, async ctx => {
  const query: string = ctx.match[0]

  const { replyHTML, paginationButtons } = await getInitBooksSearchResponse(query)

  return ctx.sendMessage(replyHTML, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(paginationButtons),
  })
})

async function getInitBooksSearchResponse(query: string) {
  const books = (await flibustaApi.getBooksByName(query)) || []
  const { replyHTML, paginationButtons } = composeBooksResponse(query, 1, books)
  return { replyHTML, paginationButtons }
}

bot.action(/.+/, async ctx => {
  const action: { page?: number; query?: string; id?: number; format?: BookFormat; currentPage?: number } = JSON.parse(
    ctx.match[0]
  )
  if (action.hasOwnProperty('page') && action.hasOwnProperty('query')) {
    if (action['currentPage'] === action.page) {
      // requesting same page that is already displaying
      return await ctx.answerCbQuery() // send ack so user don't see spining wheel like there is no answer from server
    }
    const currentPage = action.page as number
    const query = action.query as string
    const books = (await flibustaApi.getBooksByName(query)) || []

    const { replyHTML, paginationButtons } = composeBooksResponse(query, currentPage, books)

    return ctx
      .editMessageText(replyHTML === '' ? 'no response' : replyHTML, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(paginationButtons),
      })
      .catch(e => console.log(e.response))
  } else if (action.hasOwnProperty('id') && action.hasOwnProperty('format')) {
    //user requested to download book with format
    const book = (await getBookInfoById(action.id as number)) as BookInfo
    const replyHTML = `${book.title}\n ${book.author}\n\n ${book.description}\n`
    const bookFile = await downloadBook(String(action.id), action.format)

    const inputFile = Input.fromBuffer(bookFile.file, bookFile.fileName)
    await ctx.editMessageText(replyHTML, { parse_mode: 'HTML' })
    return await ctx.replyWithDocument(inputFile)

    // return ctx.sendDocument(inputFile)
  }
})

bot.catch(e => {
  console.log('ERROR')
  console.log(e)
})

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

async function getPage(url: string) {
  try {
    const { data } = await axios.get(url)
    return data
  } catch (error) {
    console.log(error)
  }
}
function getDownloadUrl(id: string, format: BookFormat = 'mobi'): string {
  return `${ORIGIN}/b/${id}/${format}`
}
async function downloadBook(id: string, format: BookFormat = 'mobi'): Promise<BookFile> {
  const response = await axios({
    url: getDownloadUrl(id, format),
    method: 'GET',
    responseType: 'arraybuffer',
  })
  let fileName: string = response.headers['content-disposition'].slice(21)
  fileName = fileName.replaceAll('"', '').replaceAll("'", '')
  if (!fileName) throw new Error(`Book ${id} unavailable.`)

  return {
    id,
    file: response.data,
    fileName,
  }
}

async function getBookInfoById(id: number): Promise<BookInfo | undefined> {
  const page: string = await getPage(`${ORIGIN}/b/${id}`)
  const authorRegExp = /\/script><a href="\/a\/[0-9]+">(?<author>[\w\W][^<>()|]+)<\/a>/i
  const titleRegExp = /<title>(?<title>[\w\W][^()|]+).*<\/title>/i
  const bookDescriptionRegExp = /<h2>Аннотация<\/h2>\n<p>(?<description>.*?)<\/p>/s
  const bookFormatRegExp = /\/b\/\d+\/(\w+)"/g
  //  \>\(\1\) /g
  try {
    const bookInfo: BookInfo = { id, author: '', title: '', description: '', formats: [] }

    const authorMatch = authorRegExp.exec(page)
    if (authorMatch && authorMatch.groups) {
      bookInfo.author = authorMatch.groups.author.trim()
    }

    const titleMatch = titleRegExp.exec(page)
    if (titleMatch && titleMatch.groups) {
      bookInfo.title = titleMatch.groups.title.trim()
    }

    const descriptionMatch = bookDescriptionRegExp.exec(page)
    if (descriptionMatch && descriptionMatch.groups) {
      bookInfo.description = descriptionMatch.groups.description.trim().replaceAll('<br />', '\n')
    }

    const formats = [...page.matchAll(bookFormatRegExp)].map(format => format[1]).filter(format => format !== 'read')
    bookInfo.formats = formats

    return bookInfo
  } catch (e) {
    console.log(e)
  }
}

function composeBooksResponse(query: string, currentPage: number, books: Array<BooksByName>) {
  const totalPages = Math.ceil(books.length / PAGE_SIZE)
  const paginationButtons = getPaginationButtons(currentPage, totalPages, query)

  const paginatedBooks = paginate(books, currentPage)
  let replyHTML =
    `Found ${books.length} books\n\n` +
    paginatedBooks.reduce((acc, bookAuthors) => {
      acc += book2Html(bookAuthors.book, bookAuthors.authors)
      return acc + '\n'
    }, '')
  replyHTML = replyHTML === '' ? 'no response' : replyHTML

  return { replyHTML, paginationButtons }
}

function book2Html(book: Book, authors: Array<Author>) {
  /** 
   * Стивен Кинг идёт в кино (сборник) - ru
Кинг, Стивен. Сборники
Стивен  Кинг
Скачать книгу: /download314781
   */
  const authorsNames = authors.reduce((acc, author) => {
    acc += author.name
    return acc
  }, '')
  let result = `<b>${book.name}</b>\n`
  result += authorsNames + '\n'
  result += `Download /download${book.id}\n`

  return result
}

function paginate<Type>(items: Array<Type>, page = 1, pageSize = PAGE_SIZE): Array<Type> {
  return items!.slice((page - 1) * pageSize, page * pageSize)
}

function getPaginationButtons(currentPage: number, totalPages: number, query: string) {
  const pagesArray = parsePages(currentPage, totalPages)
  const buttons = pagesArray.map(pageObj => {
    const callback = JSON.stringify({ page: pageObj.page, query, currentPage })
    return Markup.button.callback(pageObj.buttonLabel, callback)
  })
  return buttons
}

function parsePages(currentPage: number, totalPages: number): Array<{ buttonLabel: string; page: number }> {
  let buttonPayload: Array<{ buttonLabel: string; page: number }> = [{ buttonLabel: '', page: 1 }]
  if (totalPages <= 5) {
    buttonPayload = Array(totalPages)
      .fill('')
      .map((_, i) => ({ buttonLabel: wrapCurrentPage(currentPage, i + 1), page: i + 1 }))
  } else {
    if (currentPage <= 3)
      buttonPayload = [
        { buttonLabel: wrapCurrentPage(currentPage, 1), page: 1 },
        { buttonLabel: wrapCurrentPage(currentPage, 2), page: 2 },
        { buttonLabel: wrapCurrentPage(currentPage, 3), page: 3 },
        { buttonLabel: wrapNextPage(4), page: 4 },
        { buttonLabel: wrapLastPage(totalPages), page: totalPages },
      ]
    if (currentPage >= 4 && currentPage <= totalPages - 3)
      buttonPayload = [
        { buttonLabel: wrapFirstPage(), page: 1 },
        { buttonLabel: wrapPreviousPage(currentPage - 1), page: currentPage - 1 },
        { buttonLabel: wrapCurrentPage(currentPage, currentPage), page: currentPage },
        { buttonLabel: wrapNextPage(currentPage + 1), page: currentPage + 1 },
        { buttonLabel: wrapLastPage(totalPages), page: totalPages },
      ]
    if (currentPage >= totalPages - 2)
      buttonPayload = [
        { buttonLabel: wrapFirstPage(), page: 1 },
        { buttonLabel: wrapPreviousPage(totalPages - 3), page: totalPages - 3 },
        { buttonLabel: wrapCurrentPage(currentPage, totalPages - 2), page: totalPages - 2 },
        { buttonLabel: wrapCurrentPage(currentPage, totalPages - 1), page: totalPages - 1 },
        { buttonLabel: wrapCurrentPage(currentPage, totalPages), page: totalPages },
      ]
  }
  return buttonPayload
}

function wrapFirstPage() {
  const firstPageSymbol = '<<'
  return `${firstPageSymbol}1`
}
function wrapPreviousPage(pageNumber: number) {
  const previousPageSymbol = '<'
  return `${previousPageSymbol}${pageNumber}`
}
function wrapLastPage(pageNumber: number) {
  const lastPageSymbol = '>>'
  return `${pageNumber}${lastPageSymbol}`
}
function wrapNextPage(pageNumber: number) {
  const nextPageSymbol = '>'
  return `${pageNumber}${nextPageSymbol}`
}
function wrapCurrentPage(currentPage: number, page: number) {
  const currentPageSymbol = '·'
  return currentPage === page ? `${currentPageSymbol}${currentPage}${currentPageSymbol}` : `${page}`
}
