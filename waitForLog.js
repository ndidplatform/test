const args = require('minimist')(process.argv.slice(2))
const fs = require('fs')

if (!args.file) throw new Error('Specify --file')
const file = args.file

if (!args.text) throw new Error('Specify --text')
const text = args.text

if (!args.count) throw new Error('Specify --count')
const count = +args.count

function main () {
  console.log(`Waiting for log file "${file}" to contain ${count} instance(s) of "${text}"`)
  check()
}

function exitWhenTimeOff() {
  console.log("Exit because it is too long")
  process.exit(1)
}

function check () {
  const data = fs.readFileSync(args.file, 'utf8')
  const found = data.split(text).length - 1
  console.log('Found', found, 'match(es).')
  if (found >= count) {
    console.log('Done!')
  } else {
    setTimeout(check, 1000)
  }
}

setTimeout(exitWhenTimeOff, 60000)
main()
