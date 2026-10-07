type BackHandler = () => boolean;

const stack: BackHandler[] = [];

export function pushBackHandler(handler: BackHandler): () => void {
  stack.push(handler);
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index >= 0) stack.splice(index, 1);
  };
}

export function consumeBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i]()) return true;
  }
  return false;
}
