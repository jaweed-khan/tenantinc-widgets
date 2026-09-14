// Widget #19 — My Account
import { createWidget } from '@shared/createWidget';
import { MyAccount } from './MyAccount';
import type { MyAccountProps } from './MyAccount';

export const { init, clean } = createWidget<MyAccountProps>(MyAccount);
