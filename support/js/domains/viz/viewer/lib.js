import { data } from "./state.js";

export function getEditorLink(path) {
  return "vscode://file/" + data.cwd + "/" + path;
}
