import { NextResponse } from 'next/server';

export function middleware(req) {
  const sitePassword = process.env.SITE_PASSWORD;

  // Если пароль не задан — пропускаем всех (для локальной разработки)
  if (!sitePassword) return NextResponse.next();

  const cookie = req.cookies.get('auth');

  // Уже авторизован
  if (cookie?.value === sitePassword) return NextResponse.next();

  // Страница входа — пропускаем
  const { pathname } = req.nextUrl;
  if (pathname === '/login') return NextResponse.next();

  // API входа — пропускаем
  if (pathname === '/api/auth') return NextResponse.next();

  // Всё остальное — редирект на /login
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
