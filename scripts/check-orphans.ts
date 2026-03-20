import { runValidation, } from '../src/validators'

const result = await runValidation({ validators: ['orphans',], },)
process.exit(result.errors > 0 ? 1 : 0,)
