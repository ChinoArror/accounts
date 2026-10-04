export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0;
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return 1;
  const varieties = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter((pattern) => pattern.test(password)).length;
  if (password.length < 10 || (varieties < 3 && password.length < 14)) return 1;
  return password.length >= 14 && varieties >= 3 ? 3 : 2;
}

export function passwordProblem(password: string): string {
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password needs at least 8 characters, including letters and numbers.';
  }
  if (passwordStrength(password) < 2) return 'Password is too weak. Use at least 10 characters and mix letter case or symbols.';
  return '';
}
