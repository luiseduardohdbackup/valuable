var _ = require('./utils'),
    uuid = require('node-uuid'),
    Immutable = require('immutable'),
    Literal = require('./literal'),
    Model = require('./model'),
    Collection = require('./collection'),
    Snapshot = require('./snapshot');

var validateDefinition = function validateDefinition(definition) {
  _.invariant(_.isPlainObject(definition), 'Store(): definition must be an object of modelName:string -> modelProps:object');
  _.each(definition, function(model, key) {
    _.invariant(_.isPlainObject(model), 'Store(): each prop must be an object of propName:string -> propType:constructor (eg Model.Str) ' + key);
    _.each(model, function(type, prop) {
      _.invariant(type === Literal || type.prototype instanceof Literal, 'Store(): each prop must be a Literal/Decimal/Str/Bool etc ' + prop);
    })
  });
};

var Store = function Store(definition) {
  if (process.env.NODE_ENV !== 'production') {
    validateDefinition(definition);
  }

  var store = Immutable.Map(),
      models = {},
      modelName;

  for (modelName in definition) {
    if (definition.hasOwnProperty(modelName)) {
      models[modelName] = Model.define(definition[modelName], modelName);
      store = store.set(modelName, Immutable.OrderedMap())
    }
  }
  this._listeners = [];
  this._models = models;
  this._source = store;
  this._snapshot = new Snapshot(this._source, this._models);
};

Store.prototype.is = Store.is = function Store$is(a, b) {
  return a === b || a._source === b._source;
};

Store.prototype.snapshot = function Store$snapshot() {
  return this._snapshot;
};

Store.prototype.get = function Store$get(modelName, id) {
  return this._snapshot.get(modelName, id);
};

Store.prototype.create = function Store$create(model, attributes) {
  if (process.env.NODE_ENV !== 'production') {
    _.invariant(model in this._models, 'Store(): model not defined ' + model);
    _.invariant(!attributes || _.isPlainObject(attributes), 'Store(): attributes is an optional object');
  }
  return new this._models[model](attributes);
};

Store.prototype.observe = function Store$observe(fn) {
  if (process.env.NODE_ENV === 'production') {
    _.invariant(typeof fn === 'function', 'Store(): observer must be a function');
  }
  this._listeners.push(fn);
};

Store.prototype.unobserve = function Store$unobserve(fn) {
 this._listeners = this._listeners.filter(function(observer) {
    return observer !== fn;
  }); 
};

Store.prototype.restoreSnapshot = function Store$restoreSnapshot(snapshot) {
  _.invariant(snapshot instanceof Snapshot, 'Store(): can only restore from a snapshot()');
  this._source = snapshot._source;
  this._notify();
};

Store.prototype.commit = function Store$commit(_args) {
  var args = _.isArray(_args) ? _args : arguments,
      source = this._source,
      collection,
      modelName,
      model,
      id,
      index,
      length;
  length = args.length;
  for (index = 0; index < length; index++) {
    model = args[index];
    modelName = model._path;
    collection = source.get(modelName);
    if (model._destroy) {
      collection = collection.delete(model.id);
    } else {
      model.id = model.id || uuid.v4();
      collection = collection.set(model.id, model.raw());
    }
    source = source.set(modelName, collection);
  }
  this._source = source;
  this._snapshot = new Snapshot(this._source, this._models);
  this._notify();
};

Store.prototype._notify = function Store$private$notify() {
  var length = this._listeners.length;
  for (var ix = 0; ix < length; ix++) {
    this._listeners[ix]();
  }
};

module.exports = Store;