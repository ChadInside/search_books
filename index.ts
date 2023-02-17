import { Context, Telegraf, Markup, Composer } from 'telegraf'
import { Update } from 'typegram'
import { useNewReplies } from 'telegraf/future'
import { message } from 'telegraf/filters'
import FlibustaAPI from 'flibusta'

import dotenv from 'dotenv'
import Book from 'flibusta/build/types/book'
import Author from 'flibusta/build/types/authors'
import { randomInt } from 'crypto'
dotenv.config()

const bot: Telegraf<Context<Update>> = new Telegraf(process.env.BOT_TOKEN)
const flibustaApi = new FlibustaAPI('http://flibusta.is/')
const PAGE_SIZE = 5
bot.use(useNewReplies())

// bot.use(Telegraf.log())

bot.hears(/^.{1,3}$/, async ctx => {
  return ctx.sendMessage(`Too short query`)
})
bot.hears(/.+/, async ctx => {
  const query: string = ctx.match[0]
  console.log(query)

  const books = (await flibustaApi.getBooksByName(query)) || []
  // console.dir(books)\

  const page = 1
  const pages = Math.ceil(books.length / PAGE_SIZE)
  const pageBooks = paginate(books, page)
  // console.log(paginatedBooks.length)
  const array = new Array(pages).fill('')
  console.dir(array)
  const pageButtons = (new Array(pages).fill('')).map((_, i) => {
    console.log({_})
    console.log(i)
    return Markup.button.callback(`${i}`, `page:${i}, query: ${query}`)
  })
  console.log(pageButtons)
  
  const response: string = pageBooks!.reduce((acc, bookAuthors) => {
    acc += book2Html(bookAuthors.book, bookAuthors.authors)
    return acc + '\n'
  }, '')

  return ctx.sendMessage(response === '' ? 'no response' : response, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(pageButtons),
  })
})
bot.hears(/.+/, async ctx => {
  return ctx.reply(`Oh, ${ctx.match[0]}! Great choice`)
})
bot.catch(e => {
  console.log('ERROR')
  console.log(e)
})

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

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

function paginate(books: Array<any>, page = 1, pageSize = PAGE_SIZE) {
  return books.slice((page - 1) * pageSize, page * pageSize)
}
