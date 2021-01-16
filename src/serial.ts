import SerialPort from 'serialport'

const { Readline } = SerialPort.parsers
let port: SerialPort
let parser
type receiverFunc = ((line: string) => void)
let receiver: receiverFunc | null = null
let unsolicitedReceivers: receiverFunc[] = []
let logger: any = null

export async function open(device: { path: string, baudRate: number }): Promise<void> {
  const { path, baudRate } = device
  return new Promise((resolve, reject) => {
    port = new SerialPort(path, {
      baudRate
    }, (error) => {
      if (error) {
        reject(new Error(`can't connect to ${path}`))
      } else {
        parser = new Readline({ delimiter: '\n' })
        port.pipe(parser)
        parser.on('data', (line: string) => {
          if (logger) {
            logger.debug(line.toUpperCase())
          }
          if(receiver) {
            receiver(line)
            receiver = null
          }
          if (unsolicitedReceivers.length > 0) {
            unsolicitedReceivers.forEach((func: receiverFunc) => func(line))
          }
        })
        resolve()
      }
    })
  })
}

export function write(data: string): void {
  if (port) {
    if (logger) {
      logger.debug(data.trim())
    }
    port.write(data, 'ascii')
    port.drain()
  }
}

export function setReceivedCallback(f: receiverFunc): void {
  receiver = f
}

export function pushUnsolicitedReceiverCallback(f: receiverFunc): void {
  unsolicitedReceivers.push(f)
}

export function popUnsolicitedReceiverCallback(): void {
  unsolicitedReceivers.pop()
}

export function useLogger(l: any): void {
  logger = l
}
