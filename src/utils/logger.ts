export const logger = {
  info(message: string, ...args: unknown[]) {
    console.log(message, ...args);
  },
  error(message: string, ...args: unknown[]) {
    console.error(message, ...args);
  }
};
