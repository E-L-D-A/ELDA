export const html = (style, importmap, body) => /* html */`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ELDA dependency diagram</title>
    <style>
      ${style}
    </style>
    <script type="importmap">${JSON.stringify(importmap)}</script>
  </head>
  <body>
    ${body}
  </body>
</html>
`;