var assert = require('assert');
var stream = require('stream');
var util = require('util');
var net = require('net');
var EventEmitter = require('events').EventEmitter;

function MessageBuffer(messageCount) {
  this.messageMax = messageCount;
  this.messagesAdded = 0;
  this.messagesDropped = 0;
  this.buffer = [];
}

MessageBuffer.prototype.add = function(message) {
  var idx = this.messagesAdded % this.messageMax;
  if (this.messagesAdded++ < this.messageMax) {
    this.buffer.push(message);
  } else {
    this.buffer[idx] = message;
    this.messagesDropped++;
  }
}

MessageBuffer.prototype.length = function() {
  return this.buffer.length;
}

MessageBuffer.prototype.droppedMessageCount = function() {
  return this.messagesDropped;
}

MessageBuffer.prototype.drain = function(cb) {
  var oldBuffer = this.buffer;
  this.buffer = [];

  if (this.messagesAdded > oldBuffer.length) {
    var startIdx = this.messagesAdded % oldBuffer.length;
    for (var i=startIdx; i<(oldBuffer.length + startIdx); i++) {
      cb(oldBuffer[i % this.messageMax]);
    }
  } else {
    oldBuffer.forEach(cb);
  }
  this.messagesDropped = 0;
  delete old_buffer;
}

function BunyanTcpStream(args) {
  assert(args.server, "Must define a server");
  assert(args.port, "Must supply a port");
  this.server = args.server;
  this.port = args.port;
  this.reconnectDelay = args.reconnectDelay || 5000; // Try every 5s
  this.transformFun = args.transform || function(a) {return a};

  this.connectionCount = 0;
  this.connectionAttempts = 0; // Cleared after each connection
  this.messageBuffer = new MessageBuffer(args.offlineBuffer || 100);
  this.shouldTryReconnect = false;
  EventEmitter.call(this);
  process.nextTick(this.connect.bind(this));
}

util.inherits(BunyanTcpStream, EventEmitter);

BunyanTcpStream.prototype.write = function(event) {
  if (this.connected) {
    var output = JSON.stringify(this.transformFun(event)) + '\n';
    this.socket.write(output);
  } else {
    this.messageBuffer.add(event);
  }
};

BunyanTcpStream.prototype.close = function() {
  this.shouldTryReconnect = false;
  this.socket.end();
};

BunyanTcpStream.prototype.bufferedMessageCount = function() {
  return this.messageBuffer.length();
};

BunyanTcpStream.prototype.droppedMessageCount = function() {
  return this.messageBuffer.droppedMessageCount();
};

BunyanTcpStream.prototype.connect = function() {
  if (!this.connected) {
    var self = this;
    this.shouldTryReconnect = true;
    self.emit('connecting', ++self.connectionAttempts);
    self.socket = new net.Socket();
    self.socket.unref();

    self.socket.on('error', function(err) {
      self.emit('socketError', err);
    });

    self.socket.on('connect', function() {
      self.connected = true;
      self.connectionAttempts = 0;
      self.emit('connect', ++self.connectionCount);
      if (self.messageBuffer.length()) {
        var dropped = self.messageBuffer.droppedMessageCount();
        self.messageBuffer.drain(self.write.bind(self));
        if (dropped) {
          self.emit('dropped_messages', dropped);
        }
      };
    });

    self.socket.on('close', function() {
      self.emit('disconnect');
      self.socket.destroy();
      self.socket = undefined;
      self.connected = false;
      self.emit('disconnect');
      if (self.shouldReconnect()) {
        var timeout = setTimeout(self.connect.bind(self), self.retryInterval());
        timeout.unref();
      }
    });

    self.socket.connect(self.port, self.server);
  }
};
BunyanTcpStream.prototype.connected = false;
BunyanTcpStream.prototype.shouldReconnect = function() {return this.shouldTryReconnect;}
BunyanTcpStream.prototype.retryInterval = function() {
  return this.reconnectDelay;
}

function createBunyanStream(args) {
  return new BunyanTcpStream(args);
}

module.exports.createBunyanStream = createBunyanStream;
module.exports.MessageBuffer = MessageBuffer;
