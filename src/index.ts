import express from 'express'
import { customsearch } from '@googleapis/customsearch'
import 'dotenv/config'
import puppeteer from 'puppeteer'
import natural from 'natural'
import { removeStopwords } from 'stopword'
import OpenAI from 'openai'

const app = express()
const browser = await puppeteer.launch()
const tokenizer = new natural.TreebankWordTokenizer()
const search = customsearch({ version: 'v1', auth: process.env.GOOGLE_API_KEY })
const openai = new OpenAI({ baseURL: process.env.OPENAI_URL, apiKey: process.env.OPENAI_API_KEY })

app.use(express.static('public'))

app.get('/', (_, res) => {
  res.sendFile('index.html')
})

app.get('/search', async (req, res) => {
  const query = req.query.q as string

  if (!query) {
    return res.send({ error: 'Query parameter is required' }).status(400)
  }

  try {
    const searchReslut = await search.cse.list({ q: query, cx: process.env.SEARCH_MOTOR_ID })
    const formattedResults: { tokens: string[]; title: string; link: string }[] = []

    if (searchReslut.data.items?.length) {
      await Promise.allSettled(
        searchReslut.data.items.map(async (item) => {
          const page = await browser.newPage()
          if (item.link) {
            await page.goto(item.link)
            const textContent = (await page.$eval('*', (el: any) => el.innerText.replace(/\n/g, ' '))) as string
            const tokens = removeStopwords(tokenizer.tokenize(textContent.toLowerCase()))
            await page.close()
            formattedResults.push({
              tokens,
              title: item.title || '',
              link: item.link
            })
          }
        })
      )
    }

    const completion = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Provide a concise answer or summary for the query "${query}" using the text content from 10 top search results. Do not begin the response with "Here is a concise summary" or "The summary for", just provide the result directly. You have access to real-time information because the search request are coming from live google results\n`
        },
        {
          role: 'user',
          content:
            `Here are the search results for: "${query}"\n` +
            formattedResults
              .map((item, index) => `Result ${index + 1}:\nTitle: ${item.title}\n Tokens: ${item.tokens}\n`)
              .join('\n')
        }
      ],
      stream: true
    })

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })

    for await (const chunk of completion) {
      const [choice] = chunk.choices
      const { content } = choice.delta
      process.stdout.write(content || '')
      res.write(content)
    }

    return res.end()
  } catch (error) {
    console.error(error)
    res.send({ error: 'Internal server error' }).status(500)
  }
})

app.listen(process.env.PORT, () => {
  console.log(`Server is running on http://localhost:${process.env.PORT}`)
})
