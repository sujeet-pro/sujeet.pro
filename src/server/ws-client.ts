/**
 * WebSocket client script injected into HTML pages during dev.
 *
 * On connect, reports the current page path to the server.
 * On 'reload' message, refreshes the page.
 * On disconnect, retries after 1 second.
 */
export const WS_CLIENT_SCRIPT = `<script>
(function() {
  var ws = new WebSocket('ws://' + location.host + '/__ws');
  ws.onopen = function() {
    ws.send(JSON.stringify({ type: 'page', path: location.pathname }));
  };
  ws.onmessage = function(e) {
    var msg = JSON.parse(e.data);
    if (msg.type === 'reload') location.reload();
  };
  ws.onclose = function() {
    setTimeout(function() { location.reload(); }, 1000);
  };
})();
</script>`
