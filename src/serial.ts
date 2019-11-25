import SerialPort from 'serialport'
const Readline = require('@serialport/parser-readline')

let port: SerialPort
let parser
type receiverFunc = (line: string) => void
let receiver: receiverFunc | null = null

export async function open(device: { path: string, baudRate: number }): Promise<void> {
  const { path, baudRate } = device
  return new Promise((resolve, reject) => {
    port = new SerialPort(path, {
      baudRate
    }, (error) => {
      if (error) {
        reject(new Error(`can't connect to ${path}`))
      } else {
        parser = new Readline()
        port.pipe(parser)
        parser.on('data', (line: string) => {
          receiver && receiver(line)
          receiver = null
        })
        resolve()
      }
    })
  })
}

export function write(data: string): void {
  port.write(data, 'ascii')
}

export function setReceivedCallback(f: receiverFunc): void {
  receiver = f
}
