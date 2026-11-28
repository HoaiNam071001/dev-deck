import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; /** Đổi giá trị này (vd. đường dẫn repo) thì thử dựng lại */ resetKey?: string; label?: string }
type State = { error: Error | null; key?: string }

/** Chặn lỗi render để không trắng cả màn hình: hiện nội dung lỗi và nút thử lại. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { key: props.resetKey, error: null } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ErrorBoundary]', error, info.componentStack) }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="flex flex-col gap-2 p-4 text-[13px]">
        <b className="text-danger">{this.props.label ?? 'Màn hình này gặp lỗi khi hiển thị'}</b>
        <pre className="max-h-60 overflow-auto rounded-md border border-border bg-bg p-2 font-mono text-[11px] whitespace-pre-wrap text-fg-soft">{error.stack ?? error.message}</pre>
        <div className="flex gap-2">
          <button type="button" className="btn sm" onClick={() => this.setState({ error: null })}>Thử lại</button>
          <button type="button" className="btn sm" onClick={() => location.reload()}>Tải lại ứng dụng</button>
        </div>
      </div>
    )
  }
}
