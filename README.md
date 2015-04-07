# bunyan-tcp
TCP transport for Bunyan with reconnection.

## Quick start:

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

## Parameters
| Name | Description | Default |
| server (required) | The host to connect to | _none_
| port (required) | The server port to connect to | _none_
| reconnectDelay | Time to pause between disconnect and reconnect (in ms) | 500ms
| offlineBuffer | Number of messages to buffer while disconnected | 100 messages


## Events
| Name | Description | Arguments
| connecting | Emitted when the stream attempts a connection | Number of unsuccessful connection attempts
| connect | Emitted on successful connection | Number of successful connections during the life of this process.
| disconnect | Got disconnected from the remote server | _none_
| dropped_messages | Emitted when the stream reconnects if some events have been discarded to stay in buffer limits | Number of dropped messages.

## Methods
| Name | Description
| connect | If previously closed, attempts to reconnect. This is called on instantiation.
| close | Disconnect from the remote server
| bufferedMessageCount | If currently disconnected, the number of messages in offline buffer
| dropperMessageCount | If currently disconnected, number of messages that have been discarded


