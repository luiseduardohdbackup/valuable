var _ = require('lodash'),
    assert = require('assert'),
    uuid = require('node-uuid'),
    mori = require('mori'),
    Literal = require('./literal'),
    Model = require('./model'),
    Collection = require('./collection'),
    Snapshot = require('./snapshot');

var Store = function Store(definition) {
  if (process.env.NODE_ENV !== 'production') {
    assert.ok(_.isPlainObject(definition) && !_.isEmpty(definition), 'Store(): definition must be an object of modelName:string -> modelProps:object');
    _.each(definition, function(model, key) {
      assert.ok(_.isPlainObject(model), 'Store(): each prop must be an object of propName:string -> propType:constructor (eg Model.Str) ' + key);
      _.each(model, function(type, prop) {
        assert.ok(type === Literal || type.prototype instanceof Literal, 'Store(): each prop must be a Literal/Decimal/Str/Bool etc ' + prop);
      })
    });
  }

  var store = mori.hash_map(),
      models = {},
      modelName;

  for (modelName in definition) {
    if (definition.hasOwnProperty(modelName)) {
      models[modelName] = Model.define(definition[modelName], modelName);
      store = mori.assoc(store, modelName, mori.hash_map());
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
    assert.ok(model in this._models, 'Store(): model not defined ' + model);
    assert.ok(!attributes || _.isPlainObject(attributes), 'Store(): attributes is an optional object');
  }
  return new this._models[model](attributes);
};

Store.prototype.observe = function Store$observe(fn) {
  if (process.env.NODE_ENV === 'production') {
    assert.equal(typeof fn, 'function', 'Store(): observer must be a function');
  }
  this._listeners.push(fn);
};

Store.prototype.unobserve = function Store$unobserve(fn) {
 this._listeners = this._listeners.filter(function(observer) {
    return observer !== fn;
  }); 
};

Store.prototype.restoreSnapshot = function Store$restoreSnapshot(snapshot) {
  assert.ok(snapshot instanceof Snapshot, 'Store(): can only restore from a snapshot()');
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
    collection = mori.get(source, modelName);
    if (model._destroy) {
      collection = mori.dissoc(collection, model.id);
    } else if (model.id) {
      collection = mori.assoc(collection, model.id, model.raw());
    } else {
      model.id = uuid.v4();
      collection = mori.assoc(collection, model.id, model.raw());
    }
    source = mori.assoc(source, modelName, collection);
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