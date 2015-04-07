# bunyan-tcp
TCP transport for Bunyan with reconnection.

Quick start:

```{javascript}
var tcpStream = bunyanTcp.createBunyanStream({
  server: 'my.logging.server',
  port: 1234,
});

var log = bunyan.createLogger({
    name: 'log',
    streams: [
        {
          level: 'info',
          stream: tcpStream,
          type: 'raw',
          closeOnExit: true
        }
    ]
});

```

