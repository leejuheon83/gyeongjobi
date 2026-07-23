-- 보안 진단(advisor) 조치: 함수 search_path 고정, 트리거 함수 외부 호출 차단

alter function check_user_role_department() set search_path = public;
alter function set_request_no() set search_path = public;
alter function set_updated_at() set search_path = public;
alter function log_request_status_change() set search_path = public;
alter function prevent_payment_delete() set search_path = public;
alter function prevent_paid_request_delete() set search_path = public;

revoke execute on function log_request_status_change() from public, anon, authenticated;
