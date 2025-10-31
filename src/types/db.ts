// path: src/types/db.ts
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE';

export interface Org {
  id: string;
  name: string;
  slug: string;
  is_active?: boolean | null;
}

export interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

export interface UserRow {
  id: string;
  email: string | null;
}

export interface MembershipRow {
  user_id: string;
  org_id: string;
  role: Role;
}

export interface MembershipJoined extends MembershipRow {
  user: UserRow;
  profile?: { full_name: string | null } | null;
}

export interface ShiftRow {
  id: string;
  org_id: string;
  user_id: string;
  start_at: string | null;
  end_at: string | null;
}

export interface RpcMyOrgsRow {
  org_id: string;
  role: Role;
}

export interface ApiResult<T> {
  data?: T;
  error?: string;
}
