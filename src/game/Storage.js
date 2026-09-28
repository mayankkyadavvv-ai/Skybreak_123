export function readStored(key,fallback=null){try{return globalThis.localStorage?.getItem(key) ?? fallback;}catch{return fallback;}}
export function writeStored(key,value){try{globalThis.localStorage?.setItem(key,value);return true;}catch{return false;}}
