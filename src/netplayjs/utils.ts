export function get<K, V>(map: Map<K, V>, key: K): V {
  let result = map.get(key);
  if (result !== undefined) {
    return result;
  }
  throw new Error(`Key ${String(key)} not in Map ${map.toString()}`);
}

export function clone(object: any): any {
  return JSON.parse(JSON.stringify(object));
}

export function shift<V>(array: Array<V>): V {
  let result = array.shift();
  if (result !== undefined) {
    return result;
  }
  throw new Error(`Shift returned undefined from Array ${array.toString()}`);
}
