
export function joinRegexes(regexes: (RegExp | string)[], flags?: string) {
  let regexSource: string = '';
  for (const re of regexes) {
    if (typeof re === 'string') {
      regexSource += re;
    } else {
      regexSource += re.source;
    }
  }
  let regex: RegExp = new RegExp(regexSource, flags);
  return regex;
}

export const symbolicTokenPattern = joinRegexes([
  /[A-Za-z_]+|[<=>:|]+|[`']+|[+-]+|[\/*\\]+|[!?]+|[#&@$]+|[\^~]+/,
  /|\[+|\]+|[\{\}]+/,
  /|\.{2,}/,
  /|\,|\;|\(|\)/
]);

export const integerTokenPattern = /\d+/;
export const floatTokenPattern = /\d*\.\d+/;
export const numericTokenPattern = /\d+(?:\.\d+)?|\.\d+/; // more efficient

export const stringTokenPattern = /"[^"\n]*"/;

export const symbolicOrNumericTokenPattern = joinRegexes([
  symbolicTokenPattern,
  /|/,
  numericTokenPattern
]);
export const tokenPattern = joinRegexes([
  symbolicOrNumericTokenPattern,
  /|/,
  stringTokenPattern
]);
export const nonAsciiCharPattern = /[^\x00-\x7F]/;
