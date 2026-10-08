/*
  Small DOM helper shared by every view.

  Vao2 builds its interface with document.createElement rather than HTML
  strings, so text coming from feeds can never be interpreted as markup.
*/

/** Create an element with an optional class name and text content. */
export function element(tag, className = "", text = "") {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== "") {
    node.textContent = String(text);
  }

  return node;
}
