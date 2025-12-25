

export const protect = async (req, res , next ) =>{
    try {
        const {userId} = await req.auth()
        if(!userId) {
            return res.status(401).json({message : "Unauthorized"})
        }
        req.userId = userId; // <--- ATTACH IT HERE
        return next()
        
    } catch (error) {
        console.log(error)
        return res.status(401).json({message : error.code || error.message})
    }
}