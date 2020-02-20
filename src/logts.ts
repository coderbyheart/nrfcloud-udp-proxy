import * as chalk from 'chalk'

export const withts = (fn: (...args: any[]) => void) => (...args: any) =>
	fn(chalk.gray(`[${new Date().toISOString()}]`), ...args)
