import { useEffect } from 'react'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

type LoginForm = { username: string; password: string }

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname || '/'

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, from, navigate])

  const onFinish = async (values: LoginForm) => {
    try {
      await login(values.username, values.password)
      message.success('登录成功')
      navigate(from, { replace: true })
    } catch (e) {
      message.error(e instanceof Error ? e.message : '登录失败')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f5f5f5',
      }}
    >
      <Card style={{ width: 360 }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          阳光医疗-调优版
        </Typography.Title>
        <Form layout="vertical" onFinish={onFinish} initialValues={{ username: 'admin' }}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
