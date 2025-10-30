import readline from 'readline';

export function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question + ' ', (answer) => resolve(answer.trim()));
  });
}
