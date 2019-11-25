import EventEmitter from 'events'
import * as serial from './serial'

const SEPARATOR = ':'

const RECEIVE_TIMEOUT = 12
const MAX_REQUEST_ATTEMPTS = 2
const REQUEST_TIME_SPACE = 2

export type packet = string
export type param = number

export const Param = {
  ADDRESS: 254,
  UID: 255
}

export const enum Method {
  GET = 'g',
  SET = 's'
}

export type Request = {
  method: Method;
  param: param;
  address: number;
  value?: number;
  extraValue?: number;
}

export type Response = {
  address: number;
  param: param;
  value: number;
  extraValue?: number;
}

export type Slave = {
  uid: number,
  address: number
}

const eventEmitter = new EventEmitter()
eventEmitter.setMaxListeners(Infinity)
const requestQueue: Request[] = []

export function begin(device: { path: string, baudRate: number }): Promise<void> {
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

function process(response: packet): Response {
  const [address, param, ...values] = response
    .substr(1)
    .split(SEPARATOR)
    .map(p => parseInt(p))

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

function send(req: Request): Promise<Response> {
  return new Promise((resolve: (r: Response) => void, reject: () => void) => {
    serial.write(construct(req))
    const timeout = setTimeout(reject, RECEIVE_TIMEOUT)
    serial.setReceivedCallback((packet: packet) => {
      clearTimeout(timeout)
      resolve(process(packet))
    })
  })
}

function requestComplete(): Promise<void> {
  return new Promise((resolve: () => void) => {
    eventEmitter.once('response', () => {
      setTimeout(resolve, REQUEST_TIME_SPACE)
    })
  })
}

async function request(req: Request): Promise<Response> {
  requestQueue.push(req)

  while (requestQueue[0] !== req) {
    await requestComplete()
  }

  const finish = (): void => {
    requestQueue.shift()
    eventEmitter.emit('response', req)
  }

  let attempts = 0
  while (attempts < MAX_REQUEST_ATTEMPTS) {
    try {
      const response = await send(req)
      finish()
      return response
    } catch (e) {
      attempts++
    }
  }

  finish()
  throw new Error('no response')
}

export function get(address: number, param: param): Promise<Response> {
  return request({ method: Method.GET, address, param })
}

export function set(address: number, param: param, value: number, extraValue?: number): Promise<Response> {
  return request({ method: Method.SET, address, param, value, extraValue })
}
