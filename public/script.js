window.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#search-form')
  const input = document.querySelector('#search-input')
  const response = document.querySelector('#response')

  if (form && response && input) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      response.innerHTML = 'Searching...'

      const res = await fetch(`/search?q=${input.value}`)
      let reader = res?.body?.getReader()
      input.value = ''

      if (reader) {
        let decoder = new TextDecoder('utf8')
        let result
        let text = ''
        while (!result?.done) {
          result = await reader.read()
          console.log(result)
          text = text + decoder.decode(result.value)
          response.innerHTML = `<pre>${text}</pre>`
        }
      }
    })
  }
})
