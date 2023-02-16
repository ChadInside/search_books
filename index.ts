import { Context, Telegraf, Markup, Composer } from 'telegraf'
import { Update } from 'typegram'
import { useNewReplies } from 'telegraf/future'
import { message } from 'telegraf/filters'
import axios from 'axios'
import dotenv from 'dotenv'
dotenv.config()
import superagent from 'superagent'


const bot: Telegraf<Context<Update>> = new Telegraf(process.env.BOT_TOKEN)
bot.use(useNewReplies())

// bot.use(Telegraf.log())

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
