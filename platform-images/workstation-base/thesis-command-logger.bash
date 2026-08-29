#!/usr/bin/env bash

if [[ $- != *i* || -n "${THESIS_COMMAND_LOGGER_ACTIVE:-}" ]]; then
    return 0 2>/dev/null || exit 0
fi

export THESIS_COMMAND_LOGGER_ACTIVE=1
THESIS_SESSION_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
export THESIS_SESSION_ID
export THESIS_COMMAND_LOG_DIR="${THESIS_COMMAND_LOG_DIR:-/var/log/thesis-labs/commands}"
export THESIS_COMMAND_LOG_PATH="${THESIS_COMMAND_LOG_PATH:-${THESIS_COMMAND_LOG_DIR}/commands.jsonl}"
THESIS_SESSION_STARTED_AT="$(date +%s)"
export THESIS_SESSION_STARTED_AT

mkdir -p "${THESIS_COMMAND_LOG_DIR}" 2>/dev/null || true
touch "${THESIS_COMMAND_LOG_PATH}" 2>/dev/null || true

__thesis_write_log() {
    local event="$1"
    local command_text="${2:-}"
    local duration="${3:-}"
    local timestamp="${4:-}"
    if [[ -z "${timestamp}" ]]; then
        timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    fi

    if [[ -n "${command_text}" ]]; then
        jq -cn \
            --arg timestamp "${timestamp}" \
            --arg lab "${LAB_ID:-unknown}" \
            --arg student "${STUDENT_ID:-unknown}" \
            --arg session_id "${THESIS_SESSION_ID}" \
            --arg event "${event}" \
            --arg command "${command_text}" \
            --argjson duration_seconds "${duration:-null}" \
            '{timestamp:$timestamp, lab:$lab, student:$student, session_id:$session_id, event:$event, command:$command, duration_seconds:$duration_seconds}' \
            >> "${THESIS_COMMAND_LOG_PATH}" 2>/dev/null || true
    elif [[ -n "${duration}" ]]; then
        jq -cn \
            --arg timestamp "${timestamp}" \
            --arg lab "${LAB_ID:-unknown}" \
            --arg student "${STUDENT_ID:-unknown}" \
            --arg session_id "${THESIS_SESSION_ID}" \
            --arg event "${event}" \
            --argjson duration_seconds "${duration}" \
            '{timestamp:$timestamp, lab:$lab, student:$student, session_id:$session_id, event:$event, duration_seconds:$duration_seconds}' \
            >> "${THESIS_COMMAND_LOG_PATH}" 2>/dev/null || true
    else
        jq -cn \
            --arg timestamp "${timestamp}" \
            --arg lab "${LAB_ID:-unknown}" \
            --arg student "${STUDENT_ID:-unknown}" \
            --arg session_id "${THESIS_SESSION_ID}" \
            --arg event "${event}" \
            '{timestamp:$timestamp, lab:$lab, student:$student, session_id:$session_id, event:$event}' \
            >> "${THESIS_COMMAND_LOG_PATH}" 2>/dev/null || true
    fi
}

__thesis_last_history_id="$(history 1 | sed -E 's/^ *([0-9]+).*/\1/' 2>/dev/null || true)"
__thesis_command_started_us=""
__thesis_command_started_at=""

# The DEBUG trap fires before every simple command. The first one after a
# prompt marks the start of the command line the student entered; the prompt
# hook below clears the mark once it has logged the command with its duration.
__thesis_mark_command_start() {
    if [[ -n "${COMP_LINE:-}" || -n "${__thesis_command_started_us}" ]]; then
        return 0
    fi
    __thesis_command_started_us="${EPOCHREALTIME/./}"
    __thesis_command_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

__thesis_log_command() {
    local ended_us="${EPOCHREALTIME/./}"
    local history_line history_id command_text elapsed_us duration
    history_line="$(HISTTIMEFORMAT='' history 1 2>/dev/null || true)"
    history_id="$(printf '%s\n' "${history_line}" | sed -E 's/^ *([0-9]+).*/\1/' 2>/dev/null || true)"
    command_text="$(printf '%s\n' "${history_line}" | sed -E 's/^ *[0-9]+ +//' 2>/dev/null || true)"
    if [[ -n "${history_id}" && "${history_id}" != "${__thesis_last_history_id}" && -n "${command_text}" ]]; then
        __thesis_last_history_id="${history_id}"
        duration=""
        if [[ -n "${__thesis_command_started_us}" ]]; then
            elapsed_us=$(( ended_us - __thesis_command_started_us ))
            printf -v duration '%d.%03d' $(( elapsed_us / 1000000 )) $(( (elapsed_us / 1000) % 1000 ))
        fi
        __thesis_write_log "command" "${command_text}" "${duration}" "${__thesis_command_started_at}"
    fi
    __thesis_command_started_us=""
    __thesis_command_started_at=""
}

__thesis_log_session_end() {
    local ended_at duration
    ended_at="$(date +%s)"
    duration="$((ended_at - THESIS_SESSION_STARTED_AT))"
    __thesis_write_log "session_end" "" "${duration}"
}

__thesis_write_log "session_start"
trap __thesis_log_session_end EXIT

trap __thesis_mark_command_start DEBUG

# The logger runs last so that any other prompt hook still counts as part of
# the previous command rather than starting the next one.
if [[ -n "${PROMPT_COMMAND:-}" ]]; then
    PROMPT_COMMAND="${PROMPT_COMMAND}; __thesis_log_command"
else
    PROMPT_COMMAND="__thesis_log_command"
fi
