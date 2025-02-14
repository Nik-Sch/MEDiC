#!/usr/bin/env node

'use strict';
import { read, readFileSync, writeFileSync } from 'fs';
import { argv, exit } from 'process';
import { basename, dirname } from 'path';

interface IInstruction {
  regex: RegExp;
  result: (match: RegExpMatchArray) => { instr: string, imm?: number | false }
}

const aluOps: { [i: string]: string } = {
  add: '000',
  sub: '001',
  and: '010',
  eor: '100',
  xor: '100',
  xnor: '101',
  lsr: '110',
  lsl: '111',
};


const branchOps: { [i: string]: string } = {
  b: '0000',
  bal: '0000',
  jmp: '0000',
  beq: '0001',//
  bne: '0010',//
  bcs: '0011',//
  bhs: '0011',//
  bcc: '0100',//
  blo: '0100',//
  bmi: '0101',//
  bpl: '0110',//
  bvs: '0111',//
  bvc: '1000',//
  bhi: '1001',//
  bls: '1010',//
  bge: '1011',//
  blt: '1100',//
  bgt: '1101',//
  ble: '1110',//
};

const aluOpRegEx = Object.keys(aluOps).reduce((p, c) => `${p}|${c}`);
const branchOpRegEx = Object.keys(branchOps).reduce((p, c) => `${p}|${c}`);
const numericRegEx = '\\b0x[0-9a-fA-F]+\\b|-?\\d+\\b';
const identifierRegEx = '[a-zA-Z]\\w*';
const stringRegEx = '"(\\\\.|[^"])*"';
const labelDefRegEx = `\\s*(${identifierRegEx}):\\s*`;
const constantDefRegEx = `\\s*(${identifierRegEx})\\s*=\\s*(${numericRegEx})\\s*`;
const stringDefRegEx = `\\s*(${numericRegEx}).(${identifierRegEx})\\s* =\\s*(${stringRegEx})\\s*`;
const valueRegEx = `(?:${numericRegEx})|(?:${identifierRegEx})`;
const lineCommentRegex = /^\s*(?:#|@|;|(?:\/\/)).*$/m;

interface CodeLine {
  text: string;
  filename: string;
  lineNumber: number;
}
const lineToString = (c: CodeLine) => `${c.filename}:${c.lineNumber}`;
interface ILabel {
  name: string;
  instruction: number;
  line: CodeLine;
};
interface IConstants {
  name: string;
  value: number;
  line: CodeLine;
};
const labels: ILabel[] = [];
const constants: IConstants[] = [];

const checkImmediate = (match: string, options: { stack?: boolean, regValue ?: boolean } = {}) => {
  if (typeof options.stack === 'undefined') {
    options.stack = false;
  }
  if (typeof options.regValue === 'undefined') {
    options.regValue = false;
  }
  // [0xffff] is used for return address and register can only hold 8bit
  const maxImm = options.regValue ? 255 : 0xfffe;
  const minImm = options.regValue ? -128 : 0;
  let imm = parseInt(match);
  if (isNaN(imm)) {
    const constant = constants.find(c => c.name === match);
    if (constant) {
      imm = constant.value;
    } else {
      console.error(`Found no constant '${match}'`);
      exit(1);
    }
  }
  if (imm > maxImm || imm < minImm) {
    console.error(`Immediate must be in range of ${minImm} to ${maxImm} but is ${imm}.`);
    return false;
  }
  if (imm < 0) {
    imm = 256+imm; // to get the two's complement value correctly
  }
  return imm | (options.stack ? 0xff00 : 0x0000);
}

const instructions: IInstruction[] = [
  { // r/y := r x s
    regex: new RegExp(`^\\s*(${aluOpRegEx})(s?)\\s+r([01])\\s*,\\s*r([01])`),
    result: match => ({ instr: `00${match[2] == 's' ? '1' : '0'}${match[3]}${match[4]}${aluOps[match[1]]}` })
  },
  { // special case: cmp == subs
    regex: new RegExp(`^\\s*cmp\\s+r([01])\\s*,\\s*r([01])`),
    result: match => ({ instr: `001${match[1]}${match[2]}${aluOps['sub']}` })
  },
  { // r := [s] # ldr
    regex: /^\s*ldr\s+r([01])\s*,\s*\[\s*r([01])\s*\]/,
    result: match => ({ instr: `010000${match[1]}${match[2]}` })
  },
  { // [s] := r # str
    regex: /^\s*str\s+r([01])\s*,\s*\[\s*r([01])\s*\]/,
    result: match => ({ instr: `010001${match[1]}${match[2]}` })
  },
  { // r := s
    regex: /^\s*mov\s+r([01])\s*,\s*r([01])/,
    result: match => ({ instr: `010010${match[1]}${match[2]}` })
  },
  { // mar1 := r
    regex: /^\s*sma\s+r([01])\s*/,
    result: match => ({ instr: `0100110${match[1]}` })
  },
  { // mar1 = imm
    regex: new RegExp(`^\\s*sma\\s+(${valueRegEx})`),
    result: match => {
      const imm = checkImmediate(match[1], { regValue: true });
      return { instr: '01001110', imm }
    }
  },
  { // r := r x [s]
    regex: new RegExp(`^\\s*(${aluOpRegEx})\\s+r([01])\\s*,\\s*\\[\\s*r([01])\\s*\\]`),
    result: match => ({ instr: `011${match[2]}${match[3]}${aluOps[match[1]]}` })
  },
  { // r/y := r x imm
    regex: new RegExp(`^\\s*(${aluOpRegEx})(s?)\\s+r([01])\\s*,\\s*(${valueRegEx})`),
    result: match => {
      const imm = checkImmediate(match[4], { regValue: true });
      return { instr: `100${match[2] == 's' ? '1' : '0'}${match[3]}${aluOps[match[1]]}`, imm }
    }
  },
  { // special case: cmp == subs
    regex: new RegExp(`^\\s*cmp\\s+r([01])\\s*,\\s*(${valueRegEx})`),
    result: match => {
      const imm = checkImmediate(match[2], { regValue: true });
      return { instr: `1001${match[1]}${aluOps['sub']}`, imm };
    }
  },
  { // pc := imm
    regex: new RegExp(`^\\s*(${branchOpRegEx})\\s+(${numericRegEx})\\s*`),
    result: match => {
      const imm = checkImmediate(match[2]);
      return { instr: `1010${branchOps[match[1]]}`, imm }
    }
  },
  { // pc := imm
    regex: new RegExp(`^\\s*(${branchOpRegEx})\\s+(${identifierRegEx})\\s*`),
    result: match => {
      const label = labels.find(l => l.name === match[2]);
      let imm: number | false = false;
      if (typeof label === 'undefined') {
        console.error(`${match[0]}: Could not find label '${match[2]}' in the existing labels:\n${labels.map(l => ` ${l.name} @ ${lineToString(l.line)}`).join('\n')}.`);
      } else {
        imm = checkImmediate(label.instruction.toString());
      }
      return { instr: `1010${branchOps[match[1]]}`, imm }
    }
  },
  { // call
    regex: new RegExp(`^\\s*call\\s+(${identifierRegEx})\\s*`),
    result: match => {
      const label = labels.find(l => l.name === match[1]);
      let imm: number | false = false;
      if (typeof label === 'undefined') {
        console.error(`${match[0]}: Could not find label '${match[1]}' in the existing labels:\n${labels.map(l => ` ${l.name} @ ${lineToString(l.line)}`).join('\n')}.`);
      } else {
        imm = checkImmediate(label.instruction.toString());
      }
      return { instr: `10110000`, imm }
    }
  },
  { // return
    regex: /^\s*(return|ret)\s*/,
    result: () => ({ instr: `10110001` })
  },
  { // r/y := r x [imm]
    regex: new RegExp(`^\\s*(${aluOpRegEx})(s?)\\s+r([01])\\s*,\\s*\\[\\s*(${valueRegEx})\\s*\\]`),
    result: match => {
      const imm = checkImmediate(match[4], { regValue: true });
      return { instr: `110${match[2] == 's' ? '1' : '0'}${match[3]}${aluOps[match[1]]}`, imm }
    }
  },
  { // r := [s] # ldr
    regex: new RegExp(`^\\s*ldr\\s+r([01])\\s*,\\s*\\[\\s*r([01])\\s*\\]`),
    result: match => {
      return { instr: `010000${match[1]}${match[2] == 's' ? '1' : '0'}` }
    }
  },
  { // r := [imm] # ldr
    regex: new RegExp(`^\\s*ldr\\s+r([01])\\s*,\\s*\\[\\s*(${valueRegEx})\\s*\\]`),
    result: match => {
      const imm = checkImmediate(match[2]);
      return { instr: `1111000${match[1]}`, imm }
    }
  },
  { // r := [imm] # lds (from stack)
    regex: new RegExp(`^\\s*lds\\s+r([01])\\s*,\\s*\\[\\s*(${valueRegEx})\\s*\\]`),
    result: match => {
      const imm = checkImmediate(match[2], { stack: true });
      return { instr: `1111000${match[1]}`, imm }
    }
  },
  { // [s] := r # str
    regex: new RegExp(`^\\s*str\\s+r([01])\\s*,\\s*\\[\\s*r([01])\\s*\\]`),
    result: match => {
      return { instr: `010001${match[1]}` }
    }
  },
  { // [imm] := r # str
    regex: new RegExp(`^\\s*str\\s+r([01])\\s*,\\s*\\[\\s*(${valueRegEx})\\s*\\]`),
    result: match => {
      const imm = checkImmediate(match[2]);
      return { instr: `1111001${match[1]}`, imm }
    }
  },
  { // [imm] := r # sts (from stack)
    regex: new RegExp(`^\\s*sts\\s+r([01])\\s*,\\s*\\[\\s*(${valueRegEx})\\s*\\]`),
    result: match => {
      const imm = checkImmediate(match[2], { stack: true });
      return { instr: `1111001${match[1]}`, imm }
    }
  },
  { // r := [imm] # ldf from function call
    regex: new RegExp(`^\\s*ldf\\s+r([01])\\s*,\\s*\\[\\s*(${valueRegEx})\\s*\\]`),
    result: match => {
      const imm = checkImmediate(match[2], { stack: true });
      return { instr: `1111010${match[1]}`, imm }
    }
  },
  { // [imm] := r # stf for function call
    regex: new RegExp(`^\\s*stf\\s+r([01])\\s*,\\s*\\[\\s*(${valueRegEx})\\s*\\]`),
    result: match => {
      const imm = checkImmediate(match[2], { stack: true });
      return { instr: `1111011${match[1]}`, imm }
    }
  },
  { // r := imm
    regex: new RegExp(`^\\s*mov\\s+r([01])\\s*,\\s*(${valueRegEx})\\s*`),
    result: match => {
      const imm = checkImmediate(match[2], { regValue: true });
      return { instr: `1111100${match[1]}`, imm }
    }
  },
];

if (argv.length !== 4) {
  console.error(`${argv[0]} ${argv[1]} <in>.s <out>.coe|bin`);
  exit(1);
}


const readFile = (filename: string): CodeLine[] => {
  return readFileSync(filename).toString().replace('\r', '').split('\n').map((v, i) => {
    return {
      text: v,
      filename: filename,
      lineNumber: i + 1
    }
  })
}

const code = readFile(argv[2]);

let instrCount = 0;

const data: number[] = [];

const insertInstruction = (line: CodeLine): boolean => {
  for (const instr of instructions) {
    const match = line.text.match(instr.regex);
    if (match) {
      const result = instr.result(match);
      if (result.imm === false) {
        console.error(`Error in ${lineToString(line)}.`);
        exit(1);
      }
      data[instrCount] = parseInt(result.instr, 2) << 16;
      if (typeof result.imm === 'number') {
        data[instrCount] |= result.imm;
        console.log(`${instrCount.toString(16).padStart(2, '0')}: ${result.instr.trim()} - ${line.text.trim()} (imm: 0x${result.imm.toString(16).padStart(2, '0')})`);
      } else {
        console.log(`${instrCount.toString(16).padStart(2, '0')}: ${result.instr.trim()} - ${line.text.trim()}`);
      }
      instrCount++;
      return true;
    }
  }
  return false;
}

for (const [i, origLine] of code.entries()) {
  const match = origLine.text.match(/[ \t]*include\s+\"(\S+)\"$/i);
  if (match) {
    const include = readFile(dirname(argv[2]) + "/" + match[1]);
    code.splice(i, 1, ...include);
  }
}

// first pass: find strings and create instructions for it
for (const origLine of code) {
  const line = origLine.text.replace(lineCommentRegex, '');
  if (line.match(/^\s*$/)) {
    continue;
  }
  // find string definitions -> the strings are stored in memory and a constant is created that holds the start address
  const stringMatch = line.match(stringDefRegEx);
  if (stringMatch) {
    const stringAddress = checkImmediate(stringMatch[1]);
    if (stringAddress === false) {
      console.error(`string location of constant '${stringMatch[2]}' not valid: '${stringMatch[1]}'`);
      exit(1);
    }
    const values = [];
    const existingConstant = constants.find(c => c.name === stringMatch[2]);
    if (existingConstant) {
      console.error(`Constant '${stringMatch[2]}' defined multiple times (${lineToString(existingConstant.line)} and ${lineToString(origLine)}).`);
      exit(1);
    }
    if (stringMatch[2].length > 255) {
      console.error(`String '${stringMatch[3]}' exceeds the 255 char limit (${lineToString(origLine)}).`)
      exit(1);
    }

    // ignore quotes of the string
    let stringI = 1;
    let addressI = 0;
    while (stringI < stringMatch[3].length - 1) {
      let charCode = stringMatch[3].charCodeAt(stringI);
      if (charCode > 256) {
        console.error(`Char ${stringMatch[3].charAt(stringI)} with the code ${charCode} in string '${stringMatch[2]}' in ${lineToString(origLine)} is not supported.`);
        exit(1);
      }
      if (charCode == 92) { // backslash
        stringI++;
        let value = -1;
        const nextChar = stringMatch[3].charAt(stringI);
        switch (nextChar) {
          case 'n':
            value = 0x0a;
            break;
          case 'r':
            value = 0x0d;
            break;
          case 't':
            value = 0x09;
            break;
          case '\\':
            value = 0x5c;
            break;
          case '"':
            value = 0x22;
            break;
          case 'x':
            stringI++;
            let hexEnd = stringI;
            let charEndCode = stringMatch[3].charCodeAt(hexEnd);
            while ((charEndCode >= 0x30 && charEndCode <= 0x39)
              || (charEndCode >= 0x41 && charEndCode <= 0x46)
              || (charEndCode >= 0x61 && charEndCode <= 0x66)) {
                hexEnd++;
                charEndCode = stringMatch[3].charCodeAt(hexEnd);
              }
            value = parseInt(stringMatch[3].substring(stringI, hexEnd), 16);
            stringI = hexEnd - 1;
            break;
          default:
            console.error(`Unkown escape code \\${nextChar} in string ${stringMatch[3]} in ${lineToString(origLine)}.`);
            exit(1);
        }
        if (value > 255 || value < 0) {
          console.error(`Cannot store value ${value} in string ${stringMatch[3]} in ${lineToString(origLine)}.`);
          exit(1);
        }
        charCode = value;
      }
      values[addressI] = charCode;
      addressI++;
      stringI++;
    }
    values[addressI] = 0;
    // add constant and instructions
    constants.push({
      line: origLine,
      name: stringMatch[2],
      value: stringAddress
    });
    values.forEach((value, i) => {
      insertInstruction({...origLine, text: `mov r0, 0x${value.toString(16)}`});
      insertInstruction({...origLine, text: `str r0, [0x${(i + (stringAddress << 8)).toString(16)}]`});
    });
    // zero termination
  }
}
// reset mar and r0
if (instrCount > 0) {
  insertInstruction({text: 'mov r0, 0', lineNumber: -1, filename: argv[2]});
}

const startOfProgramInstr = instrCount;

const mainHasStart = code.filter(line => line.filename === argv[2] && line.text.match(labelDefRegEx)?.[1] === 'start');
const filesIncluded = [... new Set(code.map(l => l.filename))].length > 1;
// check that main file has a start label if files are included
if (filesIncluded && !mainHasStart) {
  console.error(`When including files the main file must specify a start label.`);
  exit(1);
}

// second pass: find labels and constants
for (const origLine of code) {
  const line = origLine.text.replace(lineCommentRegex, '');
  if (line.match(/^\s*$/) || line.match(stringDefRegEx)) {
    continue;
  }
  // find label definitions
  const labelMatch = line.match(labelDefRegEx);
  if (labelMatch) {
    const existingLabel = labels.find(l => l.name === labelMatch[1]);
    if (existingLabel) {
      console.error(`Label '${labelMatch[1]}' defined multiple times (${lineToString(existingLabel.line)} and ${lineToString(origLine)}).`);
      exit(1);
    }
    // ignore start labels of not main files
    if (origLine.filename !== argv[2] && labelMatch[1] === 'start') {
      console.error(`Ignoring start label from ${lineToString(origLine)}.`);
      continue;
    } else {
      labels.push({ name: labelMatch[1], instruction: instrCount, line: origLine });
      continue;
    }
  }
  // find constant definitions
  const constantMatch = line.match(constantDefRegEx);
  if (constantMatch) {
    const existingConstant = constants.find(c => c.name === constantMatch[1]);
    if (existingConstant) {
      if (origLine.filename === argv[2] && existingConstant.line.filename !== argv[2]) {
        // main file overwrites all constants
        console.error(`Overwriting constant '${constantMatch[1]}' from ${lineToString(existingConstant.line)} with value of ${lineToString(origLine)}.`);
        existingConstant.value = parseInt(constantMatch[2]);
        existingConstant.line = origLine;
        continue;
      } else {
        console.error(`Constant '${constantMatch[1]}' defined multiple times (${lineToString(existingConstant.line)} and ${lineToString(origLine)}).`);
        exit(1);
      }
    }
    constants.push({ name: constantMatch[1], value: parseInt(constantMatch[2]), line: origLine });
    continue;
  }

  let success = false;
  for (const instr of instructions) {
    const match = line.match(instr.regex);
    if (match) {
      success = true;
      instrCount++;
      break;
    }
  }
  if (!success) {
    console.error(`Unrecognized instruction in line ${lineToString(origLine)}:\n'${line.trim()}'`);
    exit(1);
  }
}

// print constants
for (const constant of constants) {
  console.log(constant.line.text.trim());
}

// insert branch to start instruction
instrCount = startOfProgramInstr;
if (labels.find(l => l.name === 'start')) {
  labels.forEach(l => l.instruction++);
  insertInstruction({text: 'b start', filename: argv[2], lineNumber: -1});
}
// third pass: find instructions
for (const origLine of code) {
  const line = origLine.text.replace(lineCommentRegex, '');
  if (line.match(/^\s*$/) || line.match(constantDefRegEx)) {
    continue;
  }
  if (line.match(stringDefRegEx)) {
    console.log(line.trim());
    continue;
  }
  if (line.match(labelDefRegEx)) {
    // only print labels that are not overwritten
    if (labels.find(l => l.line.filename === origLine.filename && l.line.lineNumber === origLine.lineNumber)) {
      console.log(line.trim());
    } else {
      console.log(`#overwritten: ${line.trim()}`);
    }
    continue;
  }
  let success = insertInstruction(origLine);
  if (!success) {
    console.error(`Unrecognized instruction in ${lineToString(origLine)}:\n'${line.trim()}'`);
    exit(1);
  }
}

const coeFile = argv[3].endsWith('.coe');
if (coeFile) {
  let fileContent = 'MEMORY_INITIALIZATION_RADIX=16;\nMEMORY_INITIALIZATION_VECTOR=\n';
  for (const word of data) {
    fileContent += `${word.toString(16).padStart(6, '0')}\n`;
  }
  fileContent += ';';
  writeFileSync(argv[3], fileContent);
} else {
  for (let i = 0; i < 3; i++) {
    const uintArray = Uint8Array.from(data.map(d => (d >> (8 * i)) & 0xff));
    writeFileSync(`${argv[3]}.${i}`, uintArray);
  }
}
