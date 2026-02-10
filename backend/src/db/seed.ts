/**
 * Сид дефолтного Супер-Админа в БД.
 * Логин: CryptoSignalPro
 * Пароль: Qqwdsaqe2123!fade!CryptoSignalPro228
 * Группа 1 (user): по умолчанию только Главная и Настройки.
 */

import bcrypt from 'bcrypt';
import { findUserByUsername, createUser, updateGroupTabs } from './authDb';

const ADMIN_LOGIN = 'CryptoSignalPro';
const ADMIN_PASSWORD = 'Qqwdsaqe2123!fade!CryptoSignalPro228';
const ADMIN_GROUP_ID = 3;
const DEFAULT_USER_TABS = '["dashboard","settings","activate"]';

export function seedDefaultAdmin(): void {
  updateGroupTabs(1, DEFAULT_USER_TABS);
  if (findUserByUsername(ADMIN_LOGIN)) return;
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  createUser(ADMIN_LOGIN, hash, ADMIN_GROUP_ID);
}
