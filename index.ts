import { Context, Telegraf, Markup, Composer } from 'telegraf'
import { Update } from 'typegram'
import { useNewReplies } from 'telegraf/future'
import { message } from 'telegraf/filters'
import FlibustaAPI from 'flibusta'

import dotenv from 'dotenv'
import Book from 'flibusta/build/types/book'
import Author from 'flibusta/build/types/authors'
import { randomInt } from 'crypto'
import { BooksByName } from 'flibusta/build/types/booksByName'
dotenv.config()

const bot: Telegraf<Context<Update>> = new Telegraf(process.env.BOT_TOKEN)
const flibustaApi = new FlibustaAPI('http://flibusta.is/')
const PAGE_SIZE = 5
bot.use(useNewReplies())

// bot.use(Telegraf.log())
bot.hears('/(?<=^download)\d+$/', async ctx=>{
//get info on book
  const bookId : number= Number(ctx.match[0])
  const book = await flibustaApi.getCoverByBookId
  return ctx.reply('👍👍')



})
bot.hears(/.+/, async ctx => {
  const query: string = ctx.match[0]
  const currentPage = 1

  const books = (await flibustaApi.getBooksByName(query)) || []

  const { replyHTML, paginationButtons } = composeReply(query, currentPage, books)

  return ctx.sendMessage(replyHTML === '' ? 'no response' : replyHTML, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(paginationButtons),
  })
})

bot.action(/.+/, async (ctx, next) => {
  const action: { page?: number; query?: string } = JSON.parse(ctx.match[0])
  if (action.hasOwnProperty('page') && action.hasOwnProperty('query')) {
    const currentPage = action.page as number
    const query = action.query as string
    const books = (await flibustaApi.getBooksByName(query)) || []

    const { replyHTML, paginationButtons } = composeReply(query, currentPage, books)
    return ctx.editMessageText(replyHTML === '' ? 'no response' : replyHTML, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(paginationButtons),
    })
  }

  return ctx.reply('👍').then(() => next())
})


bot.catch(e => {
  console.log('ERROR')
  console.log(e)
})

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

function composeReply(query: string, currentPage: number, books: Array<BooksByName>) {
  const totalPages = Math.ceil(books.length / PAGE_SIZE)
  const paginationButtons = getPaginationButtons(currentPage, totalPages, query)

  const paginatedBooks = paginate(books, currentPage)
  const replyHTML: string =
    `Found ${books.length} books\n\n` +
    paginatedBooks!.reduce((acc, bookAuthors) => {
      acc += book2Html(bookAuthors.book, bookAuthors.authors)
      return acc + '\n'
    }, '')

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
  return items.slice((page - 1) * pageSize, page * pageSize)
}

function getPaginationButtons(currentPage: number, totalPages: number, query: string) {
  const pagesArray = parsePages(currentPage, totalPages)
  const buttons = pagesArray.map(pageObj => {
    const callback = JSON.stringify({ page: pageObj.page, query })
    return Markup.button.callback(pageObj.buttonLabel, callback)
  })
  return buttons
}

function parsePages(currentPage: number, totalPages: number): Array<{ buttonLabel: string; page: number }> {
  let result: Array<{ buttonLabel: string; page: number }> = [{ buttonLabel: '', page: 0 }]
  if (totalPages <= 5) {
    result = Array(totalPages)
      .fill('')
      .map((_, i) => ({ buttonLabel: wrapCurrentPage(currentPage, i + 1), page: i + 1 }))
  } else {
    if (currentPage <= 3)
      result = [
        { buttonLabel: wrapCurrentPage(currentPage, 1), page: 1 },
        { buttonLabel: wrapCurrentPage(currentPage, 2), page: 2 },
        { buttonLabel: wrapCurrentPage(currentPage, 3), page: 3 },
        { buttonLabel: wrapNextPage(4), page: 4 },
        { buttonLabel: wrapLastPage(totalPages), page: totalPages },
      ]
    if (currentPage >= 4 && currentPage <= totalPages - 3)
      result = [
        { buttonLabel: wrapFirstPage(), page: 1 },
        { buttonLabel: wrapPreviousPage(currentPage - 1), page: currentPage - 1 },
        { buttonLabel: wrapCurrentPage(currentPage, currentPage), page: currentPage },
        { buttonLabel: wrapNextPage(currentPage + 1), page: currentPage + 1 },
        { buttonLabel: wrapLastPage(totalPages), page: totalPages },
      ]
    if (currentPage >= totalPages - 2)
      result = [
        { buttonLabel: wrapFirstPage(), page: 1 },
        { buttonLabel: wrapPreviousPage(totalPages - 3), page: totalPages - 3 },
        { buttonLabel: wrapCurrentPage(currentPage, totalPages - 2), page: totalPages - 2 },
        { buttonLabel: wrapCurrentPage(currentPage, totalPages - 1), page: totalPages - 1 },
        { buttonLabel: wrapCurrentPage(currentPage, totalPages), page: totalPages },
      ]
  }
  return result
}

function testPageButtons() {
  const MAX_BUTTONS = 5
  const totalPagesArray = [1, 2, 3, 4, 5, 6, 7, 10, 25]
  const currentPageArray = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 22, 23, 24, 25, 26, 27]

  const result = []
  for (const totalPages of totalPagesArray) {
    for (const currentPage of currentPageArray) {
      if (currentPage < 1 || currentPage > totalPages) {
        // console.log(`not valid current: ${currentPage}, total: ${totalPages}`)
        continue
      }
      result.push(parsePages(currentPage, totalPages))
    }
  }

  console.log(result)
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
