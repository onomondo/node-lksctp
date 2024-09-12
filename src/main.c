#define _GNU_SOURCE

#define NAPI_VERSION 8
#include <node_api.h>
#include <uv.h>

#include "helpers.h"

#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#include <sys/socket.h>
#include <netinet/sctp.h>
#include <arpa/inet.h>

#include <unistd.h>


napi_value create_socket(napi_env env, napi_callback_info info) {
  int socket_fd;
  napi_value js_ret_obj;

  socket_fd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, IPPROTO_SCTP);

  if (socket_fd < 0) {
    return napi_helper_create_errno_result_asserted(env, errno);
  }

  js_ret_obj = napi_helper_create_object_asserted(env);
  napi_helper_add_int32_field_asserted(env, js_ret_obj, "errno", 0);
  napi_helper_add_int32_field_asserted(env, js_ret_obj, "fd", socket_fd);

  return js_ret_obj;
}

napi_value setsockopt_sack_info(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  int errno_value;
  struct sctp_sack_info sack_info;

  memset(&sack_info, 0, sizeof(sack_info));

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "setsockopt_sack_info: fd must be provided as number");
  sack_info.sack_assoc_id = napi_helper_require_named_uint32_asserted(env, js_args_obj, "sack_assoc_id", "setsockopt_sack_info: sack_assoc_id must be provided as number");
  sack_info.sack_delay = napi_helper_require_named_uint32_asserted(env, js_args_obj, "sack_delay", "setsockopt_sack_info: sack_delay must be provided as number");
  sack_info.sack_freq = napi_helper_require_named_uint32_asserted(env, js_args_obj, "sack_freq", "setsockopt_sack_info: sack_freq must be provided as number");

  rc = setsockopt(fd, IPPROTO_SCTP, SCTP_DELAYED_ACK_TIME, &sack_info, sizeof(sack_info));
  if (rc < 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

napi_value getsockopt_sctp_status(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  napi_value js_args_obj;
  napi_value js_result;
  napi_value js_info;
  napi_status status;
  struct sctp_info sctpi;
  socklen_t sctpi_len = sizeof(sctpi);

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "setsockopt_sack_info: fd must be provided as number");

  rc = getsockopt(fd, IPPROTO_SCTP, SCTP_STATUS, &sctpi, &sctpi_len);
  if (rc < 0) {
    return napi_helper_create_errno_result_asserted(env, errno);
  }

  if (sctpi_len < offsetof(struct sctp_info, sctpi_isacks)) {
    abort_with_message("getsockopt_sctp_status: unexpected length of sctp_info");
  }

  js_info = napi_helper_create_object_asserted(env);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_tag", sctpi.sctpi_tag);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_state", sctpi.sctpi_state);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_rwnd", sctpi.sctpi_rwnd);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_unackdata", sctpi.sctpi_unackdata);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_penddata", sctpi.sctpi_penddata);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_instrms", sctpi.sctpi_instrms);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_outstrms", sctpi.sctpi_outstrms);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_fragmentation_point", sctpi.sctpi_fragmentation_point);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_inqueue", sctpi.sctpi_inqueue);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_outqueue", sctpi.sctpi_outqueue);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_overall_error", sctpi.sctpi_overall_error);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_max_burst", sctpi.sctpi_max_burst);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_maxseg", sctpi.sctpi_maxseg);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_peer_rwnd", sctpi.sctpi_peer_rwnd);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_peer_tag", sctpi.sctpi_peer_tag);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_peer_capable", sctpi.sctpi_peer_capable);
  napi_helper_add_uint64_field_asserted(env, js_info, "sctpi_peer_sack", sctpi.sctpi_peer_sack);

  js_result = napi_helper_create_object_asserted(env);
  napi_helper_add_int32_field_asserted(env, js_result, "errno", 0);
  napi_helper_set_named_property_asserted(env, js_result, "info", js_info);

  return js_result;
}

napi_value setsockopt_sctp_initmsg(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  int errno_value;
  struct sctp_initmsg initmsg;

  memset(&initmsg, 0, sizeof(initmsg));

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "setsockopt_sctp_initmsg: fd must be provided as number");
  initmsg.sinit_num_ostreams = napi_helper_require_named_uint32_asserted(env, js_args_obj, "sinit_num_ostreams", "setsockopt_sctp_initmsg: sinit_num_ostreams must be provided as number");
  initmsg.sinit_max_instreams = napi_helper_require_named_uint32_asserted(env, js_args_obj, "sinit_max_instreams", "setsockopt_sctp_initmsg: sinit_max_instreams must be provided as number");
  initmsg.sinit_max_attempts = napi_helper_require_named_uint32_asserted(env, js_args_obj, "sinit_max_attempts", "setsockopt_sctp_initmsg: sinit_max_attempts must be provided as number");
  initmsg.sinit_max_init_timeo = napi_helper_require_named_uint32_asserted(env, js_args_obj, "sinit_max_init_timeo", "setsockopt_sctp_initmsg: sinit_max_init_timeo must be provided as number");

  rc = setsockopt(fd, IPPROTO_SCTP, SCTP_INITMSG, &initmsg, sizeof(initmsg));
  if (rc < 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

napi_value setsockopt_sctp_recvrcvinfo(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  int errno_value;
  int value;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "setsockopt_sctp_recvrcvinfo: fd must be provided as number");
  value = napi_helper_require_named_int32_asserted(env, js_args_obj, "value", "setsockopt_sctp_recvrcvinfo: value must be provided as number");

  rc = setsockopt(fd, IPPROTO_SCTP, SCTP_RECVRCVINFO, &value, sizeof(value));
  if (rc < 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

napi_value setsockopt_linger(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  int errno_value;
  struct linger l;

  memset(&l, 0, sizeof(l));

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "setsockopt_linger: fd must be provided as number");
  l.l_onoff = napi_helper_require_named_int32_asserted(env, js_args_obj, "onoff", "setsockopt_linger: onoff must be provided as number");
  l.l_linger = napi_helper_require_named_int32_asserted(env, js_args_obj, "linger", "setsockopt_linger: linger must be provided as number");

  rc = setsockopt(fd, SOL_SOCKET, SO_LINGER, &l, sizeof(l));
  if (rc < 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

napi_value setsockopt_nodelay(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  int errno_value;
  int value;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "setsockopt_nodelay: fd must be provided as number");
  value = napi_helper_require_named_int32_asserted(env, js_args_obj, "value", "setsockopt_nodelay: value must be provided as number");

  rc = setsockopt(fd, IPPROTO_SCTP, SCTP_NODELAY, &value, sizeof(value));
  if (rc < 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

napi_value setsockopt_sctp_event(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  int errno_value;
  struct sctp_event event = {};

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "setsockopt_sctp_event: fd must be provided as number");
  event.se_type = napi_helper_require_named_int32_asserted(env, js_args_obj, "se_type", "setsockopt_sctp_event: se_type must be provided as number");
  event.se_on = napi_helper_require_named_int32_asserted(env, js_args_obj, "se_on", "setsockopt_sctp_event: se_on must be provided as number");

  rc = setsockopt(fd, IPPROTO_SCTP, SCTP_EVENT, &event, sizeof(event));
  if (rc < 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

static struct sockaddr* alloc_and_fill_sockaddr_list(napi_env env, napi_value js_address_list) {
  int i;
  int address_count;

  void* addrs_ptr = NULL;
  int current_addrs_offset = 0;
  int current_addrs_length = 0;

  struct sockaddr* sockaddr_ptr;
  size_t sockaddr_length;

  napi_value js_address;

  address_count = napi_helper_require_array_length(env, js_address_list);

  for(i = 0; i < address_count; i+= 1) {
    int required_length;

    js_address = napi_helper_get_element_asserted(env, js_address_list, i, "alloc_and_fill_sockaddr_list: failed to get address element");
    napi_helper_require_buffer_asserted(env, js_address, (void**) &sockaddr_ptr, &sockaddr_length, "alloc_and_fill_sockaddr_list: failed to get sockaddr buffer");

    required_length = current_addrs_offset + sockaddr_length;

    if (required_length > current_addrs_length) {
      int new_addrs_length = required_length + 128;
      void* new_addrs_ptr = realloc(addrs_ptr, new_addrs_length);

      if (new_addrs_ptr == NULL) {
        abort_with_message("alloc_and_fill_sockaddr_list: failed to allocate memory for sockaddr buffer");
      }

      addrs_ptr = new_addrs_ptr;
      current_addrs_length = new_addrs_length;
    }

    memcpy(addrs_ptr + current_addrs_offset, sockaddr_ptr, sockaddr_length);
    current_addrs_offset = required_length;
  }

  return addrs_ptr;
}

static napi_value do_sctp_bindx(napi_env env, napi_callback_info info) {
  int32_t fd;
  int flags;
  int rc;

  void* addrs_ptr = NULL;

  napi_value js_args_obj;
  napi_value js_address_list;

  int address_count;
  int errno_value;

  napi_helper_require_args_asserted(env, info, 1, &js_args_obj, "do_sctp_bindx requires exactly one argument");
  js_address_list = napi_helper_require_named_array_asserted(env, js_args_obj, "sockaddrs", "do_sctp_bindx: sockaddrs must be provided as array");

  address_count = napi_helper_require_array_length(env, js_address_list);

  addrs_ptr = alloc_and_fill_sockaddr_list(env, js_address_list);

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "do_sctp_bindx: fd must be provided as number");
  flags = napi_helper_require_named_int32_asserted(env, js_args_obj, "flags", "do_sctp_bindx: flags must be provided as number");

  rc = sctp_bindx(fd, addrs_ptr, address_count, flags);

  if (rc != 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  free(addrs_ptr);

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

struct native_listen_handle {
  int fd;
  uv_poll_t poll_handle;
  napi_env env;
  napi_ref js_callback_fn_ref;
};

struct native_poll_handle {
  int close_pending;
  int closed;
  int finalizer_called;
  int fd;
  uv_poll_t uv_poll_handle;
  napi_env env;
  napi_ref js_poll_callback_fn_ref;
};

static void poll_cb_with_handle_scope(struct native_poll_handle* poll_handle, int uv_status, int events) {
  napi_status status;
  napi_value js_callback_fn;
  napi_value js_callback_ret;
  napi_value js_arg;
  napi_value js_events;
  napi_env env = poll_handle->env;

  status = napi_get_reference_value(env, poll_handle->js_poll_callback_fn_ref, &js_callback_fn);
  if (status != napi_ok) {
    abort_with_message("poll_cb_with_handle_scope: failed to get reference to callback function");
  }

  js_events = napi_helper_create_object_asserted(env);
  napi_helper_add_bool_field_asserted(env, js_events, "readable", (events & UV_READABLE) != 0);
  napi_helper_add_bool_field_asserted(env, js_events, "writable", (events & UV_WRITABLE) != 0);

  js_arg = napi_helper_create_object_asserted(env);
  napi_helper_set_named_property_asserted(env, js_arg, "events", js_events);
  napi_helper_add_int32_field_asserted(env, js_arg, "status", uv_status);

  status = napi_call_function(env, napi_helper_get_undefined(env), js_callback_fn, 1, &js_arg, &js_callback_ret);
  if (status != napi_ok) {
    abort_with_message("poll_cb_with_handle_scope: failed to call callback function");
  }
}

static void poll_cb(uv_poll_t* handle, int uv_status, int events) {
  napi_handle_scope handle_scope;
  struct native_poll_handle* poll_handle = (struct native_poll_handle*) handle->data;

  // we need to get a handle scope to interoperate with JavaScript
  napi_helper_open_handle_scope_asserted(poll_handle->env, &handle_scope);

  poll_cb_with_handle_scope(poll_handle, uv_status, events);

  napi_helper_close_handle_scope_asserted(poll_handle->env, handle_scope);
}

static napi_value poll_start(napi_env env, napi_callback_info info) {
  napi_status status;
  napi_value js_args_obj;
  napi_value js_events_obj;
  int arg_readable = 0;
  int arg_writable = 0;
  struct native_poll_handle* poll_handle;
  enum uv_poll_event requested_events = 0;
  size_t argc = 0;
  int rc;

  status = napi_get_cb_info(env, info, &argc, NULL, NULL, (void**) &poll_handle);
  if (status != napi_ok) {
    napi_throw_error(env, NULL, "failed to get callback info");
    return napi_helper_get_undefined(env);
  }

  if (poll_handle->closed || poll_handle->close_pending) {
    napi_throw_error(env, NULL, "poll handle already closed");
    return napi_helper_get_undefined(env);
  }

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  js_events_obj = napi_helper_require_named_object_asserted(env, js_args_obj, "events", "poll_start: events must be provided as object");
  arg_readable = napi_helper_require_named_bool_asserted(env, js_events_obj, "readable");
  arg_writable = napi_helper_require_named_bool_asserted(env, js_events_obj, "writable");

  if (arg_readable) {
    requested_events |= UV_READABLE;
  }

  if (arg_writable) {
    requested_events |= UV_WRITABLE;
  }

  rc = uv_poll_start(&poll_handle->uv_poll_handle, requested_events, poll_cb);
  if (rc < 0) {
    napi_throw_error(env, NULL, "uv_poll_start failed");
    return napi_helper_get_undefined(env);
  }

  return napi_helper_get_undefined(env);
}

static napi_value poll_stop(napi_env env, napi_callback_info info) {
  napi_status status;
  struct native_poll_handle* poll_handle;
  size_t argc = 0;
  int rc;

  status = napi_get_cb_info(env, info, &argc, NULL, NULL, (void**) &poll_handle);
  if (status != napi_ok) {
    napi_throw_error(env, NULL, "failed to get callback info");
    return napi_helper_get_undefined(env);
  }

  if (poll_handle->closed || poll_handle->close_pending) {
    napi_throw_error(env, NULL, "poll handle already closed");
    return napi_helper_get_undefined(env);
  }

  rc = uv_poll_stop(&poll_handle->uv_poll_handle);
  if (rc < 0) {
    napi_throw_error(env, NULL, "uv_poll_stop failed");
    return napi_helper_get_undefined(env);
  }

  return napi_helper_get_undefined(env);
}

static void poll_handle_maybe_free(struct native_poll_handle* poll_handle);

static void poll_handle_uv_close_cb(uv_handle_t* handle) {
  struct native_poll_handle* poll_handle = (struct native_poll_handle*) handle->data;

  // add some assertions to make sure we are in a consistent state

  if (!poll_handle->close_pending) {
    abort_with_message("poll_handle_uv_close_cb: close not pending");
  }

  if (poll_handle->closed) {
    abort_with_message("poll_handle_uv_close_cb: already closed");
  }

  poll_handle->close_pending = 0;
  poll_handle->closed = 1;

  poll_handle_maybe_free(poll_handle);
}

static napi_value poll_close(napi_env env, napi_callback_info info) {
  napi_status status;
  struct native_poll_handle* poll_handle;
  size_t argc = 0;
  int rc;

  status = napi_get_cb_info(env, info, &argc, NULL, NULL, (void**) &poll_handle);
  if (status != napi_ok) {
    napi_throw_error(env, NULL, "failed to get callback info");
    return napi_helper_get_undefined(env);
  }

  if (poll_handle->closed || poll_handle->close_pending) {
    napi_throw_error(env, NULL, "poll handle already closed");
    return napi_helper_get_undefined(env);
  }

  rc = uv_poll_stop(&poll_handle->uv_poll_handle);
  if (rc < 0) {
    napi_throw_error(env, NULL, "uv_poll_stop failed");
    return napi_helper_get_undefined(env);
  }

  poll_handle->close_pending = 1;
  napi_delete_reference(poll_handle->env, poll_handle->js_poll_callback_fn_ref);

  uv_close((uv_handle_t*) &poll_handle->uv_poll_handle, poll_handle_uv_close_cb);

  return napi_helper_get_undefined(env);
}

static void poll_handle_maybe_free(struct native_poll_handle* poll_handle) {

  // fprintf(stderr, "poll_handle_maybe_free: poll_handle=%p, finalizer_called=%d, close_pending=%d, closed=%d\n", poll_handle, poll_handle->finalizer_called, poll_handle->close_pending, poll_handle->closed);

  if (!poll_handle->finalizer_called) {
    // as long as the finalizer has not been called, we cannot free the poll handle
    return;
  }

  if (poll_handle->close_pending) {
    // edge case, where uv_close has been queued, but not yet executed
    // meanwhile, garbage collection has kicked in
    return;
  }

  if (!poll_handle->closed) {
    fprintf(stderr, "poll_handle_maybe_free: poll handle not closed on garbage collection\n");

    poll_handle->close_pending = 1;
    uv_close((uv_handle_t*) &poll_handle->uv_poll_handle, poll_handle_uv_close_cb);

    // poll_handle_uv_close_cb will call poll_handle_maybe_free again
    // so for now, just return
    return;
  }

  // fprintf(stderr, "poll_handle_maybe_free: freeing poll handle\n");
  free(poll_handle);
}

static void poll_handle_finalizer(napi_env env, void* finalize_data, void* finalize_hint) {
  struct native_poll_handle* poll_handle = (struct native_poll_handle*) finalize_data;
  poll_handle->finalizer_called = 1;
  poll_handle_maybe_free(poll_handle);
}

static napi_value create_poller(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  napi_value js_args_obj;
  napi_value js_poll_callback_fn;
  napi_value js_poll_handle;
  napi_status status;
  uv_loop_t* uv_loop;
  struct native_poll_handle* poll_handle = NULL;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "create_poller: fd must be provided as number");
  js_poll_callback_fn = napi_helper_require_named_function_asserted(env, js_args_obj, "callback", "create_poller: callback must be provided as function");

  js_poll_handle = napi_helper_create_object_asserted(env);

  status = napi_get_uv_event_loop(env, &uv_loop);
  if (status != napi_ok) {
    napi_throw_error(env, NULL, "failed to get uv event loop");
    return napi_helper_get_undefined(env);
  }

  poll_handle = (struct native_poll_handle*) calloc(1, sizeof(*poll_handle));
  if (poll_handle == NULL) {
    abort_with_message("failed to allocate memory for poll handle");
  }

  napi_helper_wrap_asserted(env, js_poll_handle, poll_handle, poll_handle_finalizer, NULL, NULL, "failed to wrap poll handle");

  rc = uv_poll_init(uv_loop, &poll_handle->uv_poll_handle, fd);
  if (rc < 0) {
    abort_with_message("uv_poll_init failed");
  }

  poll_handle->fd = fd;
  poll_handle->uv_poll_handle.data = poll_handle;
  poll_handle->env = env;
  poll_handle->js_poll_callback_fn_ref = napi_helper_create_reference_asserted(env, js_poll_callback_fn, 1, "failed to create reference to callback function");

  napi_helper_add_function_field_asserted(env, js_poll_handle, "start", poll_start, poll_handle, "failed to add start function");
  napi_helper_add_function_field_asserted(env, js_poll_handle, "stop", poll_stop, poll_handle, "failed to add stop function");
  napi_helper_add_function_field_asserted(env, js_poll_handle, "close", poll_close, poll_handle, "failed to add close function");

  return js_poll_handle;
}

napi_value do_sctp_recvv(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  napi_value js_args_obj;
  napi_value js_ret_obj;
  napi_value js_rcvinfo_obj;
  napi_status status;
  void* buffer_addr;
  size_t buffer_length;
  struct sockaddr* from_address_pointer;
  size_t from_address_buffer_length;
  socklen_t from_address_length_as_socklen;
  int msg_flags = 0;
  struct iovec iov[1];
  const int iovcnt = sizeof(iov) / sizeof(iov[0]);
  struct sctp_rcvinfo rcv;
  socklen_t infolen = sizeof(rcv);
  unsigned int info_type = 0;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "do_sctp_recvv: fd must be provided as number");
  napi_helper_require_named_buffer_asserted(env, js_args_obj, "messageBuffer", (void**) &buffer_addr, &buffer_length, "do_sctp_recvv: messageBuffer must be provided as buffer");
  napi_helper_require_named_buffer_asserted(env, js_args_obj, "sockaddr", (void**) &from_address_pointer, &from_address_buffer_length, "do_sctp_recvv: sockaddr must be provided as buffer");

  iov[0].iov_base = buffer_addr;
  iov[0].iov_len = buffer_length;

  from_address_length_as_socklen = from_address_buffer_length;
  rc = sctp_recvv(fd, iov, iovcnt, from_address_pointer, &from_address_length_as_socklen, &rcv, &infolen, &info_type, &msg_flags);
  if (rc < 0) {
    return napi_helper_create_errno_result_asserted(env, errno);
  }

  js_ret_obj = napi_helper_create_object_asserted(env);
  napi_helper_add_int32_field_asserted(env, js_ret_obj, "errno", 0);
  napi_helper_add_int32_field_asserted(env, js_ret_obj, "bytesReceived", rc);
  napi_helper_add_int32_field_asserted(env, js_ret_obj, "flags", msg_flags);

  switch (info_type) {
    case SCTP_RECVV_RCVINFO: {
      js_rcvinfo_obj = napi_helper_create_object_asserted(env);
      napi_helper_add_uint64_field_asserted(env, js_rcvinfo_obj, "sid", rcv.rcv_sid);
      napi_helper_add_uint64_field_asserted(env, js_rcvinfo_obj, "ssn", rcv.rcv_ssn);
      napi_helper_add_uint64_field_asserted(env, js_rcvinfo_obj, "flags", rcv.rcv_flags);
      napi_helper_add_uint64_field_asserted(env, js_rcvinfo_obj, "ppid", ntohl(rcv.rcv_ppid));
      napi_helper_add_uint64_field_asserted(env, js_rcvinfo_obj, "context", rcv.rcv_context);

      napi_helper_set_named_property_asserted(env, js_ret_obj, "rcvinfo", js_rcvinfo_obj);

      break;
    }
    default: {
      // SCTP_RECVV_NOINFO
      // and fallback
      break;
    }
  }

  return js_ret_obj;
}

napi_value do_sctp_sendv(napi_env env, napi_callback_info info) {
  int32_t fd;
  napi_value js_args_obj;
  napi_value js_sndinfo_obj;
  napi_value js_ret_obj;
  napi_status status;
  void* buffer_addr;
  size_t buffer_length;
  uint32_t flags;
  int bytes_sent;
  struct sctp_sendv_spa spa;
  struct iovec iov[1];
  const int iovcnt = sizeof(iov) / sizeof(iov[0]);

  memset(&spa, 0, sizeof(spa));

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "do_sctp_sendv: fd must be provided as number");
  napi_helper_require_named_buffer_asserted(env, js_args_obj, "message", (void**) &buffer_addr, &buffer_length, "do_sctp_sendv: message must be provided as buffer");

  iov[0].iov_base = buffer_addr;
  iov[0].iov_len = buffer_length;

  js_sndinfo_obj = napi_helper_require_named_object_asserted(env, js_args_obj, "sndinfo", "do_sctp_sendv: sndinfo must be provided as object");
  spa.sendv_sndinfo.snd_sid = napi_helper_require_named_uint32_asserted(env, js_sndinfo_obj, "sid", "do_sctp_sendv: sndinfo.sid must be provided as number");
  spa.sendv_sndinfo.snd_ppid = htonl(napi_helper_require_named_uint32_asserted(env, js_sndinfo_obj, "ppid", "do_sctp_sendv: sndinfo.ppid must be provided as number"));
  spa.sendv_sndinfo.snd_flags = napi_helper_require_named_uint32_asserted(env, js_sndinfo_obj, "flags", "do_sctp_sendv: sndinfo.flags must be provided as number");
  spa.sendv_sndinfo.snd_context = napi_helper_require_named_uint32_asserted(env, js_sndinfo_obj, "context", "do_sctp_sendv: sndinfo.context must be provided as number");
  spa.sendv_flags = SCTP_SEND_SNDINFO_VALID;

  flags = napi_helper_require_named_uint32_asserted(env, js_args_obj, "flags", "do_sctp_sendv: flags must be provided as number");

  bytes_sent = sctp_sendv(fd, iov, iovcnt, NULL, 0, &spa, sizeof(spa), SCTP_SENDV_SPA, flags);

  js_ret_obj = napi_helper_create_object_asserted(env);

  if (bytes_sent < 0) {
    napi_helper_add_int32_field_asserted(env, js_ret_obj, "errno", errno);
  } else {
    napi_helper_add_int32_field_asserted(env, js_ret_obj, "errno", 0);
    napi_helper_add_int32_field_asserted(env, js_ret_obj, "bytesSent", bytes_sent);
  }

  return js_ret_obj;
}

static napi_value do_accept(napi_env env, napi_callback_info info) {
  int32_t fd;
  int32_t conn_fd;
  napi_value js_args_obj;
  napi_status status;
  napi_value js_ret_obj;
  char address_buffer[128];
  socklen_t address_length = sizeof(address_buffer);
  struct sockaddr* sockaddr_ptr = NULL;
  size_t sockaddr_length = 0;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "do_accept: fd must be provided as number");
  napi_helper_require_named_buffer_asserted(env, js_args_obj, "sockaddr", (void**) &sockaddr_ptr, &sockaddr_length, "do_accept: sockaddr must be provided as buffer");

  address_length = sockaddr_length;
  conn_fd = accept(fd, (struct sockaddr*) sockaddr_ptr, &address_length);

  if (conn_fd < 0) {
    return napi_helper_create_errno_result_asserted(env, errno);
  }

  js_ret_obj = napi_helper_create_object_asserted(env);

  napi_helper_add_int32_field_asserted(env, js_ret_obj, "errno", 0);
  napi_helper_add_int32_field_asserted(env, js_ret_obj, "fd", conn_fd);

  return js_ret_obj;
}

static napi_value do_listen(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  int32_t backlog;
  napi_value js_args_obj;
  napi_status status;
  int errno_value;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "do_listen: fd must be provided as number");
  backlog = napi_helper_require_named_int32_asserted(env, js_args_obj, "backlog", "do_listen: backlog must be provided as number");

  rc = listen(fd, backlog);

  if (rc != 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

static napi_value do_sctp_connectx(napi_env env, napi_callback_info info) {
  int32_t fd;
  int rc;

  void* addrs_ptr = NULL;

  napi_value js_args_obj;
  napi_value js_address_list;

  int address_count;
  int errno_value;

  napi_helper_require_args_asserted(env, info, 1, &js_args_obj, "do_sctp_connectx requires exactly one argument");
  js_address_list = napi_helper_require_named_array_asserted(env, js_args_obj, "sockaddrs", "do_sctp_connectx: sockaddrs must be provided as array");

  address_count = napi_helper_require_array_length(env, js_address_list);

  addrs_ptr = alloc_and_fill_sockaddr_list(env, js_address_list);

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "do_sctp_connectx: fd must be provided as number");

  rc = sctp_connectx(fd, addrs_ptr, address_count, NULL);

  if (rc != 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  free(addrs_ptr);

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

napi_value get_socket_error(napi_env env, napi_callback_info info) {
  int rc;
  int err;
  int32_t fd;
  napi_value js_args_obj;
  napi_value js_ret_obj;
  napi_status status;
  socklen_t err_length = sizeof(err);

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "get_socket_error: fd must be provided as number");

  rc = getsockopt(fd, SOL_SOCKET, SO_ERROR, &err, &err_length);

  js_ret_obj = napi_helper_create_object_asserted(env);

  if (rc != 0) {
    napi_helper_add_int32_field_asserted(env, js_ret_obj, "errno", errno);
  } else {
    napi_helper_add_int32_field_asserted(env, js_ret_obj, "errno", 0);
    napi_helper_add_int32_field_asserted(env, js_ret_obj, "socketError", err);
  }

  return js_ret_obj;
}

napi_value do_getsockname(napi_env env, napi_callback_info info) {
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  struct sockaddr* sockaddr_ptr;
  size_t sockaddr_length;
  socklen_t sockaddr_length_as_socklen;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "do_getsockname: fd must be provided as number");
  napi_helper_require_named_buffer_asserted(env, js_args_obj, "sockaddr", &sockaddr_ptr, &sockaddr_length, "do_getsockname: failed to get sockaddr buffer");

  sockaddr_length_as_socklen = sockaddr_length;

  errno = 0;
  getsockname(fd, sockaddr_ptr, &sockaddr_length_as_socklen);

  return napi_helper_create_errno_result_asserted(env, errno);
}

static napi_value create_buffer_array_from_dynamic_sockaddr_array(napi_env env, struct sockaddr* addrs, int num_addrs) {
  int i;
  napi_value js_buffer_array;
  struct sockaddr* current_addr = addrs;

  js_buffer_array = napi_helper_create_array_asserted(env, "create_buffer_array_from_dynamic_sockaddr_array: failed to create buffer array");

  for(i = 0; i < num_addrs; i += 1) {
    napi_value js_buffer;
    size_t addr_length;

    switch(current_addr->sa_family) {
      case AF_INET: {
        addr_length = sizeof(struct sockaddr_in);
        break;
      }
      default: {
        abort_with_message("create_buffer_array_from_dynamic_sockaddr_array: unsupported address family");
        break;
      }
    }

    js_buffer = napi_helper_create_buffer_copy_asserted(env, current_addr, addr_length, "create_buffer_array_from_dynamic_sockaddr_array: failed to create buffer");
    napi_helper_set_element_asserted(env, js_buffer_array, i, js_buffer, "create_buffer_array_from_dynamic_sockaddr_array: failed to set buffer element");

    current_addr = (struct sockaddr*) ((void*) current_addr + addr_length);
  }

  return js_buffer_array;
}

static napi_value do_sctp_getladdrs(napi_env env, napi_callback_info info) {
  int num_addrs;
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  struct sockaddr* addrs;
  napi_value js_result;
  napi_value js_addrs_array;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "do_sctp_getladdrs: fd must be provided as number");

  num_addrs = sctp_getladdrs(fd, 0, &addrs);
  if (num_addrs < 0) {
    return napi_helper_create_errno_result_asserted(env, errno);
  }

  js_result = napi_helper_create_object_asserted(env);
  napi_helper_add_int32_field_asserted(env, js_result, "errno", 0);

  js_addrs_array = create_buffer_array_from_dynamic_sockaddr_array(env, addrs, num_addrs);
  napi_helper_set_named_property_asserted(env, js_result, "sockaddrs", js_addrs_array);

  sctp_freeladdrs(addrs);

  return js_result;
}

napi_value do_getpeername(napi_env env, napi_callback_info info) {
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  struct sockaddr* sockaddr_ptr;
  size_t sockaddr_length;
  socklen_t sockaddr_length_as_socklen;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "do_getpeername: fd must be provided as number");
  napi_helper_require_named_buffer_asserted(env, js_args_obj, "sockaddr", &sockaddr_ptr, &sockaddr_length, "do_getpeername: failed to get sockaddr buffer");

  sockaddr_length_as_socklen = sockaddr_length;

  errno = 0;
  getpeername(fd, sockaddr_ptr, &sockaddr_length_as_socklen);

  return napi_helper_create_errno_result_asserted(env, errno);
}

static napi_value do_sctp_getpaddrs(napi_env env, napi_callback_info info) {
  int num_addrs;
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  struct sockaddr* addrs;
  napi_value js_result;
  napi_value js_addrs_array;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "do_sctp_getpaddrs: fd must be provided as number");

  num_addrs = sctp_getpaddrs(fd, 0, &addrs);
  if (num_addrs < 0) {
    return napi_helper_create_errno_result_asserted(env, errno);
  }

  js_result = napi_helper_create_object_asserted(env);
  napi_helper_add_int32_field_asserted(env, js_result, "errno", 0);

  js_addrs_array = create_buffer_array_from_dynamic_sockaddr_array(env, addrs, num_addrs);
  napi_helper_set_named_property_asserted(env, js_result, "sockaddrs", js_addrs_array);

  sctp_freepaddrs(addrs);

  return js_result;
}

napi_value do_shutdown(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  int32_t how;
  napi_value js_args_obj;
  napi_status status;
  int errno_value;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "close_fd: fd must be provided as number");
  how = napi_helper_require_named_int32_asserted(env, js_args_obj, "how", "close_fd: how must be provided as number");

  rc = shutdown(fd, how);

  if (rc != 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

napi_value close_fd(napi_env env, napi_callback_info info) {
  int rc;
  int32_t fd;
  napi_value js_args_obj;
  napi_status status;
  int errno_value;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  fd = napi_helper_require_named_int32_asserted(env, js_args_obj, "fd", "close_fd: fd must be provided as number");

  rc = close(fd);

  if (rc != 0) {
    errno_value = errno;
  } else {
    errno_value = 0;
  }

  return napi_helper_create_errno_result_asserted(env, errno_value);
}

napi_value parse_sctp_assoc_change_notification(napi_env env, struct sctp_assoc_change* sn_assoc_change, size_t length) {
  napi_value js_result;

  if (length < sizeof(struct sctp_assoc_change)) {
    napi_throw_error(env, NULL, "parse_sctp_assoc_change_notification: buffer too small");
    return napi_helper_get_undefined(env);
  }

  js_result = napi_helper_create_object_asserted(env);
  napi_helper_add_int32_field_asserted(env, js_result, "sac_type", sn_assoc_change->sac_type);
  napi_helper_add_int32_field_asserted(env, js_result, "sac_flags", sn_assoc_change->sac_flags);
  napi_helper_add_int32_field_asserted(env, js_result, "sac_state", sn_assoc_change->sac_state);
  napi_helper_add_int32_field_asserted(env, js_result, "sac_error", sn_assoc_change->sac_error);
  napi_helper_add_int32_field_asserted(env, js_result, "sac_outbound_streams", sn_assoc_change->sac_outbound_streams);
  napi_helper_add_int32_field_asserted(env, js_result, "sac_inbound_streams", sn_assoc_change->sac_inbound_streams);

  return js_result;
}

napi_value parse_sctp_authentication_event_notifcation(napi_env env, struct sctp_authkey_event* sn_authkey_event, size_t length) {
  napi_value js_result;

  if (length < sizeof(struct sctp_authkey_event)) {
    napi_throw_error(env, NULL, "parse_sctp_authentication_event_notifcation: buffer too small");
    return napi_helper_get_undefined(env);
  }

  js_result = napi_helper_create_object_asserted(env);
  napi_helper_add_int32_field_asserted(env, js_result, "auth_type", sn_authkey_event->auth_type);
  napi_helper_add_int32_field_asserted(env, js_result, "auth_flags", sn_authkey_event->auth_flags);
  napi_helper_add_int32_field_asserted(env, js_result, "auth_keynumber", sn_authkey_event->auth_keynumber);
  napi_helper_add_int32_field_asserted(env, js_result, "auth_indication", sn_authkey_event->auth_indication);

  return js_result;
}

napi_value parse_sctp_notification(napi_env env, napi_callback_info info) {
  napi_value js_args_obj;
  napi_value js_result;
  napi_value js_sn;
  napi_status status;
  union sctp_notification* notification_addr;
  size_t notification_length;
  size_t remaining_length;

  status = napi_helper_require_args_or_throw(env, info, 1, &js_args_obj);
  if (status != napi_ok) {
    return napi_helper_get_undefined(env);
  }

  napi_helper_require_named_buffer_asserted(env, js_args_obj, "notification", (void**) &notification_addr, &notification_length, "parse_sctp_notification: failed to get notification buffer");

  if (notification_length < 2) {
    napi_throw_error(env, NULL, "parse_sctp_notification: notification buffer too small");
    return napi_helper_get_undefined(env);
  }

  js_result = napi_helper_create_object_asserted(env);
  napi_helper_add_int32_field_asserted(env, js_result, "sn_type", notification_addr->sn_header.sn_type);

  switch(notification_addr->sn_header.sn_type) {
    case SCTP_ASSOC_CHANGE: {
      remaining_length = notification_length - offsetof(union sctp_notification, sn_assoc_change);
      js_sn = parse_sctp_assoc_change_notification(env, &notification_addr->sn_assoc_change, remaining_length);
      napi_helper_add_field_asserted(env, js_result, "sn_assoc_change", js_sn);
      break;
    }
    case SCTP_AUTHENTICATION_EVENT: {
      remaining_length = notification_length - offsetof(union sctp_notification, sn_authkey_event);
      js_sn = parse_sctp_authentication_event_notifcation(env, &notification_addr->sn_authkey_event, remaining_length);
      napi_helper_add_field_asserted(env, js_result, "sn_authkey_event", js_sn);
      break;
    }
    default: {
      // only return sn_type
      break;
    }
  }

  return js_result;
}

NAPI_MODULE_INIT() {

  napi_helper_add_function_field_asserted(env, exports, "create_socket", create_socket, NULL, "failed to add create_socket");
  napi_helper_add_function_field_asserted(env, exports, "close_fd", close_fd, NULL, "failed to add close_fd");
  napi_helper_add_function_field_asserted(env, exports, "sctp_bindx", do_sctp_bindx, NULL, "failed to add sctp_bindx");
  napi_helper_add_function_field_asserted(env, exports, "create_poller", create_poller, NULL, "failed to add create_poller");
  napi_helper_add_function_field_asserted(env, exports, "sctp_recvv", do_sctp_recvv, NULL, "failed to add sctp_recvv");
  napi_helper_add_function_field_asserted(env, exports, "sctp_sendv", do_sctp_sendv, NULL, "failed to add sctp_sendmsg");
  napi_helper_add_function_field_asserted(env, exports, "listen", do_listen, NULL, "failed to add listen");
  napi_helper_add_function_field_asserted(env, exports, "accept", do_accept, NULL, "failed to add accept");
  napi_helper_add_function_field_asserted(env, exports, "sctp_connectx", do_sctp_connectx, NULL, "failed to add sctp_connectx");
  napi_helper_add_function_field_asserted(env, exports, "get_socket_error", get_socket_error, NULL, "failed to add get_socket_error");
  napi_helper_add_function_field_asserted(env, exports, "getsockname", do_getsockname, NULL, "failed to add getsockname");
  napi_helper_add_function_field_asserted(env, exports, "sctp_getladdrs", do_sctp_getladdrs, NULL, "failed to add do_sctp_getladdrs");
  napi_helper_add_function_field_asserted(env, exports, "getpeername", do_getpeername, NULL, "failed to add getpeername");
  napi_helper_add_function_field_asserted(env, exports, "sctp_getpaddrs", do_sctp_getpaddrs, NULL, "failed to add sctp_getpaddrs");
  napi_helper_add_function_field_asserted(env, exports, "setsockopt_sack_info", setsockopt_sack_info, NULL, "failed to add setsockopt_sack_info");
  napi_helper_add_function_field_asserted(env, exports, "setsockopt_sctp_initmsg", setsockopt_sctp_initmsg, NULL, "failed to add setsockopt_sctp_initmsg");
  napi_helper_add_function_field_asserted(env, exports, "setsockopt_sctp_recvrcvinfo", setsockopt_sctp_recvrcvinfo, NULL, "failed to add setsockopt_sctp_recvrcvinfo");
  napi_helper_add_function_field_asserted(env, exports, "setsockopt_linger", setsockopt_linger, NULL, "failed to add setsockopt_linger");
  napi_helper_add_function_field_asserted(env, exports, "setsockopt_nodelay", setsockopt_nodelay, NULL, "failed to add setsockopt_nodelay");
  napi_helper_add_function_field_asserted(env, exports, "setsockopt_sctp_event", setsockopt_sctp_event, NULL, "failed to add setsockopt_sctp_event");
  napi_helper_add_function_field_asserted(env, exports, "getsockopt_sctp_status", getsockopt_sctp_status, NULL, "failed to add getsockopt_sctp_status");
  napi_helper_add_function_field_asserted(env, exports, "shutdown", do_shutdown, NULL, "failed to add shutdown");
  napi_helper_add_function_field_asserted(env, exports, "parse_sctp_notification", parse_sctp_notification, NULL, "failed to add parse_sctp_notification");

  return exports;
}
