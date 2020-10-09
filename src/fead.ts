import EventEmitter from 'events'
import * as serial from './serial'
import { Slave } from './Slave'
import { NoResponseError } from './errors'

const SEPARATOR = ':'

const broadcastAddress = 0

export type packet = string
export type param = number
type method = string

export const Param = {
  ADDRESS: 254,
  UID: 255
}

export const Method = {
  GET: 'g',
  SET: 's'
}

export type Request = {
  method: method;
  param: param;
  address?: number;
  value?: number;
  extraValue?: number;
}

export type Response = {
  address: number;
  param: param;
  value: number;
  extraValue?: number;
}

const eventEmitter = new EventEmitter()
eventEmitter.setMaxListeners(Infinity)
const requestQueue: Request[] = []

export function begin(device: { path: string; baudRate: number }): Promise<void> {
  return serial.open(device)
}

export function construct(request: Request): packet {
  const { method, param, address } = request
  let output = `${method}${address}${SEPARATOR}${param}`
  if (request.value !== undefined) {
    output += `${SEPARATOR}${request.value}`
  }
  if (request.extraValue !== undefined) {
    output += `${SEPARATOR}${request.extraValue}`
  }
  return output + '\n'
}

export function unpack(response: packet): Response {
  const [address, param, ...values] = response
    .substr(1)
    .split(SEPARATOR)
    .map(p => parseFloat(p))

  const output: Response = {
    address,
    param,
    value: values[0]
  }

  if (values.length > 1) {
    output.extraValue = values[1]
  }

  return output
}

export function write(req: Request): void {
  serial.write(construct(req))
}

export function writeAndWait(req: Request, timeout = 12): Promise<Response> {
  return new Promise((resolve: (r: Response) => void, reject: () => void) => {
    write(req)
    const _timeout = setTimeout(reject, timeout)
    serial.setReceivedCallback((packet: packet) => {
      clearTimeout(_timeout)
      const response = unpack(packet)
      if (response.param === req.param && response.address === req.address) {
        resolve(response)
      } else {
        reject()
      }
    })
  })
}

function requestComplete(nextRequestDelay = 2): Promise<void> {
  return new Promise((resolve: () => void) => {
    eventEmitter.once('response', () => {
      setTimeout(resolve, nextRequestDelay)
    })
  })
}

export async function send(request: Request, maxAttempts = 3, timeout = 30): Promise<Response> {
  requestQueue.push(request)

  while (requestQueue[0] !== request) {
    await requestComplete()
  }

  const finish = (): void => {
    requestQueue.shift()
    eventEmitter.emit('response', request)
  }

  let attempts = 1
  while (attempts <= maxAttempts) {
    try {
      const response = await writeAndWait(request, timeout)
      finish()
      return response
    } catch (e) {
      attempts++
    }
  }

  finish()
  throw new NoResponseError(`tried ${maxAttempts} and no response`)
}

export function get(address: number, param: param, extraValue?: number): Promise<Response> {
  return send({ method: Method.GET, address, param, extraValue })
}

export function set(address: number, param: param, value: number, extraValue?: number): Promise<Response> {
  return send({ method: Method.SET, address, param, value, extraValue })
}

export async function broadcast(req: Request, callback: (res: Response) => void): Promise<void> {
  while (requestQueue.length > 0) {
    await requestComplete()
  }

  req.address = broadcastAddress
  serial.pushUnsolicitedReceiverCallback((line: packet) => {
    callback(unpack(line))
  })
  write(req)

  return new Promise((resolve) => {
    setTimeout(() => {
      serial.popUnsolicitedReceiverCallback()
      resolve()
    }, 500)
  })
}

export function power(on = true) {
  serial.write(`p${on ? 1: 0}\n`)
}

export async function findOnline(): Promise<Slave[]> {
  const output: Slave[] = []
  await broadcast({
    method: Method.GET,
    param: Param.UID
  }, (response: Response) => {
    const { address, value } = response
    output.push(new Slave(address, value))
  })
  return output
}
