import * as fs from 'fs'
import EventEmitter from 'events'
import * as serial from './serial'

enum Command {
  GET_SYNC = 0x30,
  LOAD_ADDRESS = 0x55,
  PROG_PAGE = 0x64,
  LEAVE_PROGMODE = 0x51,
}

enum MemType {
  FLASH = 0x46, // 'F'
}

const PAGESIZE = 128
const EOP = 0x20

function encode(bytes: number[]): string {
  const hexs = Array.from(bytes)
    .map(e => e.toString(16).padStart(2, '0'))
    .join('')
  return `f${hexs}\n`
}

async function write(command: Command, ...bytes: number[]) {
  const packet = [command, ...bytes, EOP]
  const eventEmitter = new EventEmitter()

  serial.pushUnsolicitedReceiverCallback(() => {
    eventEmitter.emit('response')
  })

  serial.write(encode(packet))

  await new Promise((resolve) => {
      eventEmitter.once('response', () => {
        setTimeout(resolve, 5)
    })
  })
}

export async function flash(binaryFilepath: string) {
  const program = Array.from(fs.readFileSync(binaryFilepath))

  await write(Command.GET_SYNC)
  await new Promise((res) => setTimeout(res, 300))

  for (let i = 0; i < program.length; i+= PAGESIZE) {
    const address = Math.floor(i / 2)
    await write(Command.LOAD_ADDRESS, address & 0xff, (address >> 8) & 0xff)

    const page = program.slice(i, i + PAGESIZE)
    await write(Command.PROG_PAGE, (page.length >> 8) & 0xff, page.length & 0xff,
                MemType.FLASH, ...page)
  }

  await write(Command.LEAVE_PROGMODE)
}
