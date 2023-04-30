import * as fs from "fs"
import * as path from "path"
import { cwd } from "process"

interface TypeDict {
  [key: string]: string
}

interface Field {
  name: string
  type: string
  field_number: number
  is_optional?: boolean
}

interface EnumValue {
  name: string
  value: number
}

interface Enum {
  [key: string]: {
    values: EnumValue[]
  }
}

interface Message {
  fields: Field[]
}

interface Proto {
  type: string
  fields?: Field[]
  enums?: Enum
  messages?: {
    [key: string]: Message
  }
}

const typeDict: TypeDict = {
  int: "int32",
  uint: "uint32",
  long: "int64",
  ulong: "uint64",
  bool: "bool",
  string: "string",
  "byte[]": "bytes",
  double: "double",
  float: "float",
}

function formatType(type: Field, skipDotSplit = false): string {
  let code = ""
  if (type.is_optional === true) {
    code += "optional "
  } else if (!type.type.includes("List<")) {
    code += "required "
  }

  if (type.type in typeDict) {
    code += typeDict[type.type]
  } else {
    if (type.type.includes("List<")) {
      code += "repeated "
      let typename = type.type.split("<")[1].split(">")[0]

      if (!skipDotSplit) {
        if (typename.includes(".")) {
          typename = typename.split(".").pop()!
        }
      }

      if (typename in typeDict) {
        code += typeDict[typename]
      } else {
        code += typename
      }
    } else if (type.type.includes(".") && !skipDotSplit) {
      code += type.type.split(".")[1]
    } else {
      code += type.type
    }
  }

  return code
}

function resolveGenericType(type: string): string {
  if (type.includes("<")) {
    return type.split("<")[1].split(">")[0]
  } else {
    return type
  }
}

function insertStr(string: string, strToInsert: string, index: number): string {
  return string.slice(0, index) + strToInsert + string.slice(index)
}

function tryGetDict<T>(obj: { [key: string]: T }, key: string): T {
  if (key in obj) {
    return obj[key]
  } else {
    return {} as T
  }
}

if (require.main === module) {
  const protos: { [key: string]: Proto } = JSON.parse(fs.readFileSync(path.join(cwd(), "protos.json"), "utf8"))

  if (!fs.existsSync(path.join(cwd(), "proto"))) {
    fs.mkdirSync(path.join(cwd(), "proto"), { recursive: true })
  }

  for (const [name, proto] of Object.entries(protos)) {
    let code = 'syntax = "proto2";\n\n'

    if (proto.type === "message") {
      code += `message ${name} {\n`

      if (proto.fields) {
        for (const field of proto.fields) {
          let ball = false

          if (!typeDict[resolveGenericType(field.type)]) {
            if (
              !tryGetDict(proto as any, "enums")[resolveGenericType(field.type)] &&
              !tryGetDict(proto as any, "messages")[resolveGenericType(field.type)]
            ) {
              const importLine = `import "${resolveGenericType(field.type).split(".")[0]}.proto";\n`

              if (!code.includes(importLine)) {
                code = insertStr(code, importLine, 'syntax = "proto3";\n\n'.length)
              }

              ball = true
            }
          }

          const fieldType = formatType(field, ball)
          code += `    ${fieldType} ${field.name} = ${field.field_number};\n`
        }
      }

      if (proto.enums) {
        code += "\n"
        for (const [enumName, enumObj] of Object.entries(proto.enums)) {
          const enumName2 = enumName.split(".")[1]
          code += `    enum ${enumName2} {\n`

          // if (enumName2 === "Retcode" || enumName2 === "CmdId") {
          // code += `        option allow_alias = true;\n`
          // }

          for (const value of enumObj.values) {
            code += `        ${value.name} = ${value.value};\n`
          }
          code += "    }\n"
        }
      }
      code += "}\n"
    }
    fs.writeFileSync(path.join(cwd(), "proto", `${name}.proto`), code)
  }
}
