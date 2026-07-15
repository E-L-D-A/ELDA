// The page shape. A live page carries no import map - its modules load from their real URLs - so the map block renders only when an assembly supplies one.
export const html = (style, importmap, body) => /* html */`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ELDA dependency diagram</title>
    <style>
      ${style}
    </style>
    ${importmap ? `<script type="importmap">${JSON.stringify(importmap)}</script>` : ''}
  </head>
  <body>
    ${body}
  </body>
</html>
`;