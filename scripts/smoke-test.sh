#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_URL="${TARGET_URL:-https://llmgateway.0xff.workers.dev}"

if [[ -f "${ROOT_DIR}/.env" ]]; then
	set -a
	source "${ROOT_DIR}/.env"
	set +a
fi

if [[ -z "${BAIDU_KEY:-}" ]]; then
	echo "BAIDU_KEY is required. Put it in .env or export it before running." >&2
	exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

request() {
	local name="$1"
	local method="$2"
	local path="$3"
	local body="${4:-}"
	local auth="${5:-yes}"

	local headers_file="${TMP_DIR}/${name}.headers"
	local body_file="${TMP_DIR}/${name}.body"
	local curl_args=(
		-sS
		-X "${method}"
		-D "${headers_file}"
		-o "${body_file}"
		"${TARGET_URL}${path}"
	)

	if [[ "${auth}" == "yes" ]]; then
		curl_args+=(-H "Authorization: Bearer ${BAIDU_KEY}")
	fi

	if [[ -n "${body}" ]]; then
		curl_args+=(-H "Content-Type: application/json" --data "${body}")
	fi

	curl "${curl_args[@]}" > /dev/null
	printf '%s\n' "${headers_file}" "${body_file}"
}

status_code() {
	awk '/^HTTP\// { code=$2 } END { print code }' "$1"
}

assert_status() {
	local actual="$1"
	local expected="$2"
	local label="$3"
	if [[ "${actual}" != "${expected}" ]]; then
		echo "[FAIL] ${label}: expected ${expected}, got ${actual}" >&2
		exit 1
	fi
	echo "[PASS] ${label}: ${actual}"
}

assert_contains() {
	local file="$1"
	local needle="$2"
	local label="$3"
	if ! grep -Fq "${needle}" "${file}"; then
		echo "[FAIL] ${label}: missing '${needle}'" >&2
		echo "--- ${file} ---" >&2
		cat "${file}" >&2
		exit 1
	fi
	echo "[PASS] ${label}"
}

assert_any_contains() {
	local file="$1"
	local label="$2"
	shift 2

	for needle in "$@"; do
		if grep -Fq "${needle}" "${file}"; then
			echo "[PASS] ${label}"
			return
		fi
	done

	echo "[FAIL] ${label}: none of expected markers found" >&2
	echo "--- ${file} ---" >&2
	cat "${file}" >&2
	exit 1
}

readarray -t files < <(request models GET /baidu/v1/models)
assert_status "$(status_code "${files[0]}")" "200" "models status"
assert_contains "${files[1]}" '"object":"list"' "models list shape"
assert_contains "${files[1]}" '"id":"glm-5"' "models contains glm-5"

readarray -t files < <(request root-models GET /v1/models)
assert_status "$(status_code "${files[0]}")" "200" "root models status"
assert_contains "${files[1]}" '"id":"glm-5"' "root models contains glm-5"

readarray -t files < <(request unauth POST /baidu/v1/chat/completions '{"model":"glm-5","messages":[]}' no)
assert_status "$(status_code "${files[0]}")" "401" "unauthorized chat status"
if grep -Fq '"code":"missing_authorization"' "${files[1]}" || grep -Fq '"code":"invalid_iam_token"' "${files[1]}"; then
	echo "[PASS] unauthorized error shape"
else
	echo "[FAIL] unauthorized error shape: expected missing_authorization or invalid_iam_token" >&2
	echo "--- ${files[1]} ---" >&2
	cat "${files[1]}" >&2
	exit 1
fi

readarray -t files < <(request chat POST /baidu/v1/chat/completions '{"model":"glm-5","messages":[{"role":"user","content":"Reply with exactly: ok"}],"stream":false}')
assert_status "$(status_code "${files[0]}")" "200" "chat status"
assert_contains "${files[1]}" '"object":"chat.completion"' "chat completion shape"
assert_contains "${files[1]}" '"model":"glm-5"' "chat model echo"

readarray -t files < <(request stream POST /baidu/v1/chat/completions '{"model":"glm-5","messages":[{"role":"user","content":"Reply with exactly: ok"}],"stream":true}')
assert_status "$(status_code "${files[0]}")" "200" "stream status"
assert_contains "${files[0]}" 'text/event-stream' "stream content type"
assert_contains "${files[1]}" 'data: [DONE]' "stream done marker"

readarray -t files < <(request root-chat POST /v1/chat/completions '{"model":"glm-5","messages":[{"role":"user","content":"Reply with exactly: ok"}],"stream":false}')
assert_status "$(status_code "${files[0]}")" "200" "root chat status"
assert_contains "${files[1]}" '"object":"chat.completion"' "root chat completion shape"

readarray -t files < <(request anthropic-chat POST /baidu/anthropic/v1/messages '{"model":"glm-5","max_tokens":32,"messages":[{"role":"user","content":"Reply with exactly: ok"}]}')
assert_status "$(status_code "${files[0]}")" "200" "anthropic chat status"
assert_any_contains "${files[1]}" "anthropic response shape" '"type":"message"' '"content"'

readarray -t files < <(request root-anthropic-chat POST /anthropic/v1/messages '{"model":"glm-5","max_tokens":32,"messages":[{"role":"user","content":"Reply with exactly: ok"}]}')
assert_status "$(status_code "${files[0]}")" "200" "root anthropic chat status"
assert_any_contains "${files[1]}" "root anthropic response shape" '"type":"message"' '"content"'

echo
echo "Smoke test passed for ${TARGET_URL}"
