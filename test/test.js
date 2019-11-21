var expect = require('chai').expect;

var bunyanTcp = require('..');
var Promise = require('rsvp').Promise;
var testServer = require('./test_server');

var TEST_PORT=1234;

describe("Initialization", function() {
  it("Should present a function", function() {
    expect(bunyanTcp).to.have.property('createBunyanStream').and.be.a('function');
  });

  it("Should require a server address", function() {
    var fn = bunyanTcp.createBunyanStream.bind(bunyanTcp, {
      server: undefined,
      port: 8080
    });
    expect(fn).to.throw(/server/i);
  });

  it("Should require a port", function() {
    var fn = bunyanTcp.createBunyanStream.bind(bunyanTcp, {
      server: '127.0.0.1',
      port: undefined
    });
    expect(fn).to.throw(/port/i);
  });

  it("Should successfully return a stream when server and port are supplied", function() {
    var stream = bunyanTcp.createBunyanStream({
      server: '127.0.0.1',
      port: TEST_PORT // This port isn't listening
    });
    expect(stream).to.be.an('object');
    expect(stream).respondTo('write');
    expect(stream).respondTo('close');
    expect(stream).to.have.property('connected', false);
  });

  describe("Events", function() {
    it ("Should emit when connecting (and failing)", function() {
      return new Promise(function(resolve, reject) {
        var stream = bunyanTcp.createBunyanStream({
          server: '127.0.0.1',
          port: TEST_PORT // This port isn't listening
        });
        var got_connecting = false;
        var got_disconnect = false;
        stream.on('connecting', function() {
          connecting = true;
        });
        stream.on('disconnect', function(error) {
          got_disconnect = true;
          expect(connecting).to.equal(true);
          expect(got_disconnect).to.equal(true);
          // expect(error).to.be.an('object').and.have.property('message');
          resolve();
        });
        setTimeout(function() {
          reject(new Error("Never got disconnect event"));
        }, 10);
      });
    });
    it ("should emit on successful connection", function() {
      return testServer.getTestServer(TEST_PORT).then(function(server) {
        return new Promise(function(resolve, reject) {
          var stream = bunyanTcp.createBunyanStream({
            server: '127.0.0.1',
            port: TEST_PORT
          });
          var didConnect = false;
          stream.on('connect', function(connectionCount) {
            try {
              expect(connectionCount).to.equal(1);
              resolve();
            } catch(err) {
              reject(err);
            }
          });
          setTimeout(function() {
            reject(new Error("Never got connected event"));
          }, 10);
        }).finally(function() {server.close();});
      });
    })
  });

  describe("Writing events", function() {
    it("while connected", function() {
      return testServer.getTestServer(TEST_PORT).then(function(server) {
        return new Promise(function(resolve, reject) {
          var stream = bunyanTcp.createBunyanStream({
            server: '127.0.0.1',
            port: TEST_PORT
          });
          var message = {a: 'message'};
          stream.on('connect', function() {
            stream.write({a: 'message'});
            // TODO: do this without a timeout
            setTimeout(function() {
              expect(server.messages).to.have.property('length', 1);
              var transferred = JSON.parse(server.messages.shift());
              expect(transferred).to.have.property('a', message.a);
              resolve();
            }, 10);
          })
        }).finally(function() {server.close();});
      });
    });

    it("while disconnected", function() {
      var stream = bunyanTcp.createBunyanStream({
        server: '127.0.0.1',
        port: TEST_PORT
      });
      var message = {another: 'message'};
      stream.write(message);
      expect(stream.bufferedMessageCount()).to.equal(1);
      return testServer.getTestServer(TEST_PORT).then(function(server) {
        return new Promise(function(resolve, reject) {
          setTimeout(function() {
            expect(server.messages).to.have.property('length', 1);
            var transferred = JSON.parse(server.messages.shift());
            expect(transferred).to.have.property('another', message.another);
            expect(stream.bufferedMessageCount()).to.equal(0);
            resolve();
          }, 10);
        }).finally(function() {server.close();});
      });
    });

    it("should pass buffered events in order", function() {
      var stream = bunyanTcp.createBunyanStream({
        server: '127.0.0.1',
        port: TEST_PORT
      });
      var messagesToAdd = 3;
      for (var i=0; i< messagesToAdd; i++) {
        stream.write({messageNum: i});
      }
      return testServer.getTestServer(TEST_PORT).then(function(server) {
        return new Promise(function(resolve, reject) {
          setTimeout(function() {
            var values = server.messages.map(function(v) {
              return JSON.parse(v).messageNum;
            });
            expect(values).to.deep.equal([0, 1, 2]);
            resolve();
          }, 10);
        }).finally(function() {server.close();})
      });
    });

    it("should only buffer a certain number of events", function() {
      var testBufferSize = 5;
      var stream = bunyanTcp.createBunyanStream({
        server: '127.0.0.1',
        port: TEST_PORT,
        offlineBuffer: testBufferSize
      });
      var dropped = 0;
      stream.on('dropped_messages', function(count) {
        dropped = count;
      });
      var messagesToAdd = testBufferSize * 2 + 3; // Ensure that we are offset
      for (var i=0; i< messagesToAdd; i++) {
        stream.write({messageNum: i});
      }
      expect(stream.bufferedMessageCount()).to.equal(testBufferSize);
      expect(stream.droppedMessageCount()).to.equal(messagesToAdd - testBufferSize);
      return testServer.getTestServer(TEST_PORT).then(function(server) {
        return new Promise(function(resolve, reject) {
          setTimeout(function() {
            var values = server.messages.map(function(v) {
              return JSON.parse(v).messageNum;
            });
            expect(values.length).to.equal(testBufferSize);
            expect(dropped).to.equal(messagesToAdd - testBufferSize);
            expect(stream.bufferedMessageCount()).to.equal(0);
            expect(stream.droppedMessageCount()).to.equal(0);
            // We should keep the *most recent* n messages, in order
            expect(values).to.deep.equal([8, 9, 10, 11, 12]);
            resolve();
          }, 10);
        }).finally(function() {server.close();})
      });
    });
  });
});

describe("Reconnection", function() {
  it("should reconnect with a configurable frequency", function() {
    return new Promise(function(resolve, reject) {
      var stream = bunyanTcp.createBunyanStream({
        server: '127.0.0.1',
        port: TEST_PORT,
        reconnectDelay: 10 // in ms
      });

      var disconnectCount = 0;
      stream.on('connecting', function(count) {
        disconnectCount = count;
      });

      setTimeout(function() {
        expect(disconnectCount).to.equal(3);
        resolve();
      }, 32);
    });
  });

  it("should reconnect when disconnected", function() {
    return testServer.getTestServer(TEST_PORT).then(function(server) {
      return new Promise(function(resolve, reject) {
        var stream = bunyanTcp.createBunyanStream({
          server: '127.0.0.1',
          port: TEST_PORT,
          reconnectDelay: 1
        });

        var afterConnect = false;
        stream.on('connecting', function() {
          if (afterConnect) {
            resolve();
          }
        });

        stream.on('connect', function() {
          afterConnect = true;
          server.close();
        });
      }).finally(function() {server.close();});
    });
  })
});


describe("Disconnect", function() {
  it("should disconnect on request", function() {
    return testServer.getTestServer(TEST_PORT).then(function(server) {
      return new Promise(function(resolve, reject) {
        var stream = bunyanTcp.createBunyanStream({
          server: '127.0.0.1',
          port: TEST_PORT,
          reconnectDelay: 1
        });
        var connected = false;
        stream.on('connect', function() {
          connected = true;
        });
        var timeout = setTimeout(function() {
          reject(new Error("Didn't get a disconnect from the stream"));
        }, 500);

        stream.on('disconnect', function() {
          expect(connected).to.equal(true);
          clearTimeout(timeout);
          stream.on('connecting', function() {
            reject(new Error("Tried reconnecting.  That's not right."));
          });
          setTimeout(function() { // Give it a chance to try to reconnect
            resolve();
          }, 50);
        });

        stream.on('connect', function() {
          stream.close();
        });

      }).finally(function() {server.close();});
    });
  });
});

describe("Transforms", function() {
  it("should optionally transform objects on write", function() {
    return testServer.getTestServer(TEST_PORT).then(function(server) {
      return new Promise(function(resolve, reject) {
        var stream = bunyanTcp.createBunyanStream({
          server: '127.0.0.1',
          port: TEST_PORT,
          transform: function(event) {
            var newEvent = {};
            for (var key in event) {
              newEvent[key] = event[key].toUpperCase();
            }
            return newEvent;
          }
        });
        var testObj = {"one": "peter piper picked"};
        stream.write(testObj);
        setTimeout(function() {
          var msg = JSON.parse(server.messages.pop());
          expect(msg).to.have.property("one", testObj.one.toUpperCase());
          resolve();
        }, 10);
      }).finally(function() {server.close();});
    });
  });
});

describe("MessageBuffer", function() {
  it("should drain all of the messages up to the buffer size", function() {
    var messageBuffer = new bunyanTcp.MessageBuffer(5);
    var values = []

    messageBuffer.add(0)
    messageBuffer.add(1)
    messageBuffer.add(2)
    messageBuffer.add(3)
    messageBuffer.add(4)

    messageBuffer.drain(function (value) {
      values.push(value);
    });

    messageBuffer.add(5)
    messageBuffer.add(6)
    messageBuffer.add(7)
    messageBuffer.add(8)
    messageBuffer.add(9)

    messageBuffer.drain(function (value) {
      values.push(value);
    });

    expect(values).to.deep.equal([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ]);
  });
});
