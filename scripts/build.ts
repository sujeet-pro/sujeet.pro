import { build, } from '../src/build'

export { build, }

if (import.meta.main) {
  const parallel = process.argv.includes('--parallel',)
  build({ parallel, },).catch((err,) => {
    console.error(err,)
    process.exit(1,)
  },)
}
