var net = require('net');
var Promise = require('rsvp').Promise;

function getTestServer(port) {

  return new Promise(function(resolve, reject) {
    var server = net.createServer()
    var testServer = {
      connectionCount: 0,
      close: function() {
        if (server) {
          server.close();
          server = undefined;
        }
      },
      messages: []
    };

    function addMessages(messages) {
      testServer.messages = testServer.messages.concat(messages);
    }

    server.on('error', function(error) {
      reject(error);
    });

    server.on('connection', function(socket) {
      testServer.connectionCount++;
      var connectionData = '';
      socket.on('data', function(data) {
        var dataRemaining = true;
        connectionData = connectionData + data.toString();
        if (connectionData[connectionData.length - 1] == '\n') {
          var messages = connectionData.split('\n');
          connectionData = messages.pop();
          addMessages(messages);
        } else {
          var messages = connectionData.rtrim().split('\n');
          addMessages(messages);
          connectionData = '';
        }
      });
    });
    server.unref();
    server.listen(port, function() {
      resolve(testServer);
    });
  });
}

function withTestServer(port, callback) {
  getTestServer(port).then(function(server) {
    try {
      callback(server);
    } finally {
      server.close();
    }
  });
}

module.exports.getTestServer = getTestServer;
module.exports.withTestServer = withTestServer;
