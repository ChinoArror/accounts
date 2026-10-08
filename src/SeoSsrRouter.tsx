import { MemoryRouter } from 'react-router-dom';

export function SeoSsrRouter({ path, children }: { path: string; children: React.ReactNode }) {
  return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
}
