import { data } from "@viewer/state";

export function getEditorLink(path) {
  return "vscode://file/" + data.cwd + "/" + path;
}
