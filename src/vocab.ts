import fs from 'fs'

export type Vocab = {
  [name: string]: number
}

export function fromHeader(headerFilepath:string): Vocab {
  const header = fs.readFileSync(headerFilepath, 'utf8')
  const paramList = header.match(/[A-Z_]{3,}/g)
  const output: Vocab = {}
  paramList!.forEach((param, id) => {
    output[param] = id
  })
  return output
}
