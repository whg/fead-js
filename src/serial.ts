import SerialPort from 'serialport'

const { Readline } = SerialPort.parsers
let port: SerialPort
let parser
type receiverFunc = ((line: string) => void) | null
let receiver: receiverFunc = null
let unsolicitedReceiver: receiverFunc = null

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
          if(receiver) {
            receiver(line)
            receiver = null
          } else if (unsolicitedReceiver) {
            unsolicitedReceiver(line)
          }
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

export function setUnsolicitedReceiverCallback(f: receiverFunc): void {
  unsolicitedReceiver = f
}
