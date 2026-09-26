/**
 * Sample content shown only when the user has no real data of their own.
 * Everything here is clearly marked `demo: true` so the UI can badge it,
 * and none of it is ever written to the backend — it exists purely so a
 * brand new account isn't staring at an empty screen.
 */

export const DEMO_ENVIRONMENTS = [
  {
    id: 'demo-env-1',
    demo: true,
    name: 'Public APIs',
    variables: [
      { id: 'demo-var-1', name: 'base_url', value: 'https://jsonplaceholder.typicode.com', secret: false },
      { id: 'demo-var-2', name: 'pokeapi_url', value: 'https://pokeapi.co/api/v2', secret: false },
      { id: 'demo-var-3', name: 'token', value: 'demo-token-not-a-real-secret', secret: true },
    ],
  },
]

export const DEMO_COLLECTIONS = [
  {
    id: 'demo-col-1',
    demo: true,
    name: 'JSONPlaceholder — sample REST API',
    requests: [
      {
        id: 'demo-req-1',
        demo: true,
        name: 'List users',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/users',
        params: [],
        headers: [],
        auth: { type: 'none', token: '', username: '', password: '', key: '', value: '', in: 'header' },
        body: '',
        assertions: [{ id: 'demo-a-1', kind: 'status', path: '', expected: '200', enabled: true }],
        collection_id: 'demo-col-1',
      },
      {
        id: 'demo-req-2',
        demo: true,
        name: 'Get post #1',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        params: [],
        headers: [],
        auth: { type: 'none', token: '', username: '', password: '', key: '', value: '', in: 'header' },
        body: '',
        assertions: [{ id: 'demo-a-2', kind: 'exists', path: 'response.title', expected: '', enabled: true }],
        collection_id: 'demo-col-1',
      },
      {
        id: 'demo-req-3',
        demo: true,
        name: 'Create a post',
        method: 'POST',
        url: 'https://jsonplaceholder.typicode.com/posts',
        params: [],
        headers: [{ id: 'demo-h-1', key: 'Content-Type', value: 'application/json', enabled: true }],
        auth: { type: 'none', token: '', username: '', password: '', key: '', value: '', in: 'header' },
        body: '{\n  "title": "Outbox demo post",\n  "body": "Sent from the Outbox workspace",\n  "userId": 1\n}',
        assertions: [{ id: 'demo-a-3', kind: 'status', path: '', expected: '201', enabled: true }],
        collection_id: 'demo-col-1',
      },
    ],
  },
  {
    id: 'demo-col-2',
    demo: true,
    name: 'PokéAPI — public data set',
    requests: [
      {
        id: 'demo-req-4',
        demo: true,
        name: 'Get Pikachu',
        method: 'GET',
        url: 'https://pokeapi.co/api/v2/pokemon/pikachu',
        params: [],
        headers: [],
        auth: { type: 'none', token: '', username: '', password: '', key: '', value: '', in: 'header' },
        body: '',
        assertions: [
          { id: 'demo-a-4', kind: 'status', path: '', expected: '200', enabled: true },
          { id: 'demo-a-5', kind: 'equals', path: 'response.name', expected: 'pikachu', enabled: true },
        ],
        collection_id: 'demo-col-2',
      },
    ],
  },
]

const now = Date.now()

export const DEMO_HISTORY = [
  {
    id: 'demo-hist-1',
    demo: true,
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/users',
    status: 200,
    duration_ms: 118,
    used_bridge: false,
    created_at: new Date(now - 1000 * 60 * 6).toISOString(),
    request: DEMO_COLLECTIONS[0].requests[0],
  },
  {
    id: 'demo-hist-2',
    demo: true,
    method: 'POST',
    url: 'https://jsonplaceholder.typicode.com/posts',
    status: 201,
    duration_ms: 164,
    used_bridge: false,
    created_at: new Date(now - 1000 * 60 * 42).toISOString(),
    request: DEMO_COLLECTIONS[0].requests[2],
  },
  {
    id: 'demo-hist-3',
    demo: true,
    method: 'GET',
    url: 'https://pokeapi.co/api/v2/pokemon/pikachu',
    status: 200,
    duration_ms: 96,
    used_bridge: false,
    created_at: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
    request: DEMO_COLLECTIONS[1].requests[0],
  },
  {
    id: 'demo-hist-4',
    demo: true,
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/posts/999',
    status: 404,
    duration_ms: 84,
    used_bridge: false,
    created_at: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
    request: null,
  },
]

export const DEMO_OVERVIEW = {
  request_count: DEMO_COLLECTIONS.reduce((n, c) => n + c.requests.length, 0),
  history_count: DEMO_HISTORY.length,
  environment_count: DEMO_ENVIRONMENTS.length,
  recent: DEMO_HISTORY,
}
