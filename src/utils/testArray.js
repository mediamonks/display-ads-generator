const myArray = [



]


const perChunk = 2 // items per chunk

const inputArray = ['a','b','c','d','e']


const result = inputArray.reduce((resultArray, item, index) => {
    const chunkIndex = Math.floor(index/perChunk)
    if(!resultArray[chunkIndex]) {
        resultArray[chunkIndex] = [] // start a new chunk
    }
    resultArray[chunkIndex].push(item)
    return resultArray
}, [])

console.log(result); // result: [['a','b'], ['c','d'], ['e']]

