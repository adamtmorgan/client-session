export default class DeepProxy {
  #preproxy;
  constructor(target, handler) {
    this.#preproxy = new WeakMap();
    this._handler = handler;
    return this.proxify(target, []);
  }

  createHandler(path) {
    let self = this;
    return {
      set(target, key, value, receiver) {
        if (typeof value === 'object') {
          value = self.proxify(value, [...path, key]);
        }
        target[key] = value;

        if (self._handler.set) {
          self._handler.set(target, [...path, key], value, receiver);
        }
        return true;
      },

      deleteProperty(target, key) {
        if (key in target) {
          self.unproxy(target, key);
          let deleted = key in target;
          if (deleted && self._handler.deleteProperty) {
            self._handler.deleteProperty(target, [...path, key]);
          }
          return deleted;
        }
        return false;
      },
    };
  }

  unproxy(obj, key) {
    if (this.#preproxy.has(obj[key])) {
      obj[key] = this.#preproxy.get(obj[key]);
      this.#preproxy.delete(obj[key]);
    }

    for (let k of Object.keys(obj[key])) {
      if (typeof obj[key][k] === 'object') {
        this.unproxy(obj[key], k);
      }
    }
  }

  proxify(obj, path) {
    for (let key in obj) {
      if (typeof obj[key] === 'object') {
        obj[key] = this.proxify(obj[key], [...path, key]);
      }
    }
    let p = new Proxy(obj, this.createHandler(path));
    this.#preproxy.set(p, obj);
    return p;
  }
}
