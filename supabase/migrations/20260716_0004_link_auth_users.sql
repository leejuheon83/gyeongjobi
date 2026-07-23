-- users.id를 auth.users.id와 연결 (계정 삭제 시 프로필도 함께 삭제)
alter table users
  add constraint users_id_auth_fkey
  foreign key (id) references auth.users (id) on delete cascade;
